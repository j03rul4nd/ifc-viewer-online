// ─── certify/deep-verify.ts ───────────────────────────────────────────────────
// Deep verification (F1.5, DA-9): the receiver who HAS the file drops it on
// /verify and the browser proves, locally, (1) the bytes match the certified
// file_hash_sha256 and (2) — optionally — that the SAME validation engine
// reproduces the certified per-rule result. Nothing here performs a network
// request: the file never leaves the browser (invariant 1), and the engine is
// the exact validator.worker the app ships — never a second checker.
//
// The re-run always executes the canonical DEFAULT_RULES profile. For a
// certificate issued under a custom/EIR profile the comparison is therefore
// partial by construction — the UI must say so (display honesty, R-5).

import { DEFAULT_RULES, type ValidationIssue } from '../../types'
import { buildCertifyPayload } from './build-payload'
import type { CertifyPayloadV1, CertifyRuleStatus } from './canonical'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RuleDiff {
  rule_id: string
  certified: CertifyRuleStatus
  recomputed: CertifyRuleStatus
}

export interface RerunOutcome {
  /** true when every rule shared by both runs has the same status. */
  reproduced: boolean
  /** Health score recomputed from the fresh run (0–100). */
  recomputedScore: number
  /** Rules present in both runs whose status differs. */
  diffs: RuleDiff[]
  /** Certified rule ids the default re-run did not evaluate (custom profiles). */
  notReevaluated: string[]
  /** How many certified rules the re-run could compare. */
  comparedCount: number
}

// ── Re-run (same engine, standalone worker) ───────────────────────────────────

/** Silence window before the run is declared hung (mirrors the app watchdog). */
const WATCHDOG_SILENCE_MS = 120_000

interface PartialMsg { type: 'partial'; id: string; issues: ValidationIssue[]; progress: number }

function isPartial(m: unknown): m is PartialMsg {
  const x = m as PartialMsg
  return !!x && x.type === 'partial' && Array.isArray(x.issues)
}

/**
 * Runs the validator worker once over the dropped bytes and resolves with the
 * collected issues. A fresh worker is spawned and terminated per run — /verify
 * is a standalone route and must not touch the app's worker pool or stores.
 */
export function runStandaloneValidation(
  buffer: ArrayBuffer,
  onProgress?: (percent: number) => void,
): Promise<ValidationIssue[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../../workers/validator.worker.ts', import.meta.url), {
      type: 'module',
    })
    const id = `deep-verify-${Date.now()}`
    const issues: ValidationIssue[] = []
    let settled = false
    let watchdog: ReturnType<typeof setTimeout> | null = null

    const finish = (fn: () => void): void => {
      if (settled) return
      settled = true
      if (watchdog !== null) clearTimeout(watchdog)
      worker.terminate()
      fn()
    }
    const resetWatchdog = (): void => {
      if (watchdog !== null) clearTimeout(watchdog)
      watchdog = setTimeout(
        () => finish(() => reject(new Error('validation stalled'))),
        WATCHDOG_SILENCE_MS,
      )
    }

    worker.addEventListener('message', (e: MessageEvent<{ type?: string; id?: string; message?: string }>) => {
      const msg = e.data
      if (!msg || msg.id !== id) return
      resetWatchdog()
      if (isPartial(msg)) {
        issues.push(...msg.issues)
        onProgress?.(Math.min(msg.progress, 99))
      } else if (msg.type === 'done') {
        onProgress?.(100)
        finish(() => resolve(issues))
      } else if (msg.type === 'error') {
        finish(() => reject(new Error(msg.message ?? 'validation failed')))
      }
    })
    worker.addEventListener('error', (e) => {
      finish(() => reject(new Error(e.message || 'validator worker crashed')))
    })

    const copy = buffer.slice(0)
    ;(worker.postMessage as (m: unknown, t: Transferable[]) => void)(
      { type: 'validate', id, buffer: copy, rules: DEFAULT_RULES, skipTree: true },
      [copy],
    )
    resetWatchdog()
  })
}

// ── Comparison ────────────────────────────────────────────────────────────────

/**
 * Pure comparison of certified vs freshly recomputed per-rule statuses.
 * Exported for tests — the worker never enters this function.
 */
export function compareRuleResults(
  certified: CertifyPayloadV1['rules_result'],
  recomputed: Pick<CertifyPayloadV1, 'rules_result' | 'health_score'>,
): RerunOutcome {
  const fresh = new Map(recomputed.rules_result.map((r) => [r.rule_id, r.status]))
  const diffs: RuleDiff[] = []
  const notReevaluated: string[] = []
  let comparedCount = 0

  for (const rule of certified) {
    const now = fresh.get(rule.rule_id)
    if (now === undefined) {
      notReevaluated.push(rule.rule_id)
      continue
    }
    comparedCount++
    if (now !== rule.status) {
      diffs.push({ rule_id: rule.rule_id, certified: rule.status, recomputed: now })
    }
  }

  return {
    reproduced: diffs.length === 0 && comparedCount > 0,
    recomputedScore: recomputed.health_score,
    diffs,
    notReevaluated,
    comparedCount,
  }
}

/**
 * Re-runs the default profile over the bytes and compares per-rule statuses
 * against the certified payload. Reuses buildCertifyPayload so the
 * issue→status folding (worst-of: fail > warning > pass, info ignored) can
 * never drift from what issuance used.
 */
export async function rerunAndCompare(
  buffer: ArrayBuffer,
  cert: CertifyPayloadV1,
  onProgress?: (percent: number) => void,
): Promise<RerunOutcome> {
  const issues = await runStandaloneValidation(buffer, onProgress)
  const recomputed = await buildCertifyPayload({
    result: { issues },
    rules: DEFAULT_RULES,
    profileId: 'default',
    fileHashSha256: cert.file_hash_sha256,
  })
  return compareRuleResults(cert.rules_result, recomputed)
}
