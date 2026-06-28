// ─── EIR schema & import ──────────────────────────────────────────────────────
// Zod schema for strongly-typed, safe import/export of EIR profiles, plus a
// normalizer that expands the COMPACT authoring shorthand
//   { "entity": "IfcDoor", "requiredProperties": ["FireRating", "Manufacturer"] }
// into structured EirRule[]. Import is the only untrusted boundary — everything
// downstream (compiler, engine) trusts the validated EirProfile.

import { z } from 'zod'
import type { EirProfile, EirRule, EirSeverity } from './eir-types'

// ── Structured rule schemas (discriminated union on `type`) ───────────────────

const severitySchema = z.enum(['error', 'warning', 'info', 'ignored'])
const operatorSchema = z.enum(['>', '>=', '<', '<=', '='])

const ruleBase = {
  id: z.string().min(1),
  entity: z.string().min(1),
  predefinedType: z.string().optional(),
  severity: severitySchema,
  message: z.string().optional(),
}

export const eirRuleSchema = z.discriminatedUnion('type', [
  z.object({ ...ruleBase, type: z.literal('entityExists') }),
  z.object({ ...ruleBase, type: z.literal('requiredProperty'), pset: z.string().optional(), property: z.string().min(1) }),
  z.object({ ...ruleBase, type: z.literal('requiredPropertySet'), pset: z.string().min(1) }),
  z.object({ ...ruleBase, type: z.literal('propertyNotEmpty'), pset: z.string().optional(), property: z.string().min(1) }),
  z.object({ ...ruleBase, type: z.literal('propertyEquals'), pset: z.string().optional(), property: z.string().min(1), value: z.string() }),
  z.object({ ...ruleBase, type: z.literal('numeric'), pset: z.string().optional(), property: z.string().min(1), operator: operatorSchema, value: z.number() }),
  z.object({ ...ruleBase, type: z.literal('allowedValues'), pset: z.string().optional(), property: z.string().min(1), values: z.array(z.string()).min(1) }),
  z.object({ ...ruleBase, type: z.literal('regex'), target: z.enum(['property', 'attribute']).optional(), pset: z.string().optional(), property: z.string().min(1), pattern: z.string().min(1) }),
  z.object({ ...ruleBase, type: z.literal('classification'), system: z.string().optional(), value: z.string().optional() }),
])

export const eirProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.number().int().nonnegative(),
  description: z.string().optional(),
  rules: z.array(eirRuleSchema),
})

// ── Compact shorthand → structured rules ──────────────────────────────────────

/** A unique-enough id for an imported rule lacking one. */
let _ruleSeq = 0
function newRuleId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `rule-${crypto.randomUUID()}`
  return `rule-${Date.now()}-${_ruleSeq++}`
}

/**
 * Expand a single raw rule object into one or more structured rules. Accepts:
 *  - structured rules (have a `type`) — passed through (id back-filled);
 *  - compact rules (have `entity` + `requiredProperties`/`requiredPropertySets`)
 *    matching the example in the spec — fanned out to one rule each.
 */
function expandRawRule(raw: unknown): unknown[] {
  if (typeof raw !== 'object' || raw === null) return [raw]
  const r = raw as Record<string, unknown>
  if (typeof r.type === 'string') {
    return [{ id: typeof r.id === 'string' ? r.id : newRuleId(), severity: r.severity ?? 'error', ...r }]
  }
  // Compact form.
  const entity = r.entity
  const severity: EirSeverity = (typeof r.severity === 'string' ? r.severity : 'error') as EirSeverity
  const out: unknown[] = []
  if (typeof entity === 'string') {
    for (const prop of asStringArray(r.requiredProperties)) {
      out.push({ id: newRuleId(), type: 'requiredProperty', entity, property: prop, severity })
    }
    for (const pset of asStringArray(r.requiredPropertySets ?? r.requiredPsets)) {
      out.push({ id: newRuleId(), type: 'requiredPropertySet', entity, pset, severity })
    }
    if (out.length === 0) {
      // Bare `{ entity }` → an existence rule (most permissive reading).
      out.push({ id: newRuleId(), type: 'entityExists', entity, severity })
    }
  }
  return out
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

/**
 * Parse + validate raw JSON (string or object) into a typed EirProfile.
 * Expands the compact shorthand, back-fills ids, then validates with Zod.
 * Throws ZodError on a malformed profile and SyntaxError on bad JSON.
 */
export function parseEirProfile(input: string | unknown): EirProfile {
  const raw: unknown = typeof input === 'string' ? JSON.parse(input) : input
  if (typeof raw !== 'object' || raw === null) {
    throw new z.ZodError([{ code: 'custom', message: 'Profile must be a JSON object', path: [] }])
  }
  const r = raw as Record<string, unknown>
  const rules = Array.isArray(r.rules) ? r.rules.flatMap(expandRawRule) : []
  const candidate = {
    id: typeof r.id === 'string' && r.id ? r.id : (typeof r.name === 'string' ? slug(r.name) : newRuleId()),
    name: typeof r.name === 'string' ? r.name : 'Untitled profile',
    version: typeof r.version === 'number' ? r.version : 1,
    ...(typeof r.description === 'string' ? { description: r.description } : {}),
    rules,
  }
  return eirProfileSchema.parse(candidate) as EirProfile
}

/** Serialize a profile to pretty JSON for export/download. */
export function serializeEirProfile(profile: EirProfile): string {
  return JSON.stringify(profile, null, 2)
}

/** Lowercase kebab slug, used to derive an id from a profile name. */
export function slug(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'profile'
}

/** Convenience: validate an already-structured rule (editor live validation). */
export function isValidRule(rule: unknown): rule is EirRule {
  return eirRuleSchema.safeParse(rule).success
}
