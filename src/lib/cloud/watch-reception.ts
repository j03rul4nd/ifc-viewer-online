// ─── Watched folder → Reception inbox ────────────────────────────────────────
// Joins the connector framework (src/lib/connectors, pollFolder) to the paid
// data layer: each new IFC in a supplier's watched folder (SharePoint, Drive)
// becomes a real delivery in the Reception inbox, validated by the server
// runner, and the server fires its signed webhooks (delivery.received,
// validation.completed, delivery.accepted/rejected). The result written next
// to the model in the folder is the server's verdict, not a local guess.

import type { RemoteFile } from '../connectors/types'
import type { ValidationOutcome } from '../connectors/watch'
import { deliverFile, paidApi, type ApiDelivery } from './paid-client'

export interface ReceptionTarget {
  /** Supplier token for this folder (the supplier's, shown once when invited). */
  supplierToken: string
  /** Requirement set (the project's link slug). */
  requirementSlug: string
}

export interface WaitOptions {
  /** How long to wait for the server's validation before reporting "pending". */
  timeoutMs?: number
  intervalMs?: number
  sleep?: (ms: number) => Promise<void>
}

/** A `validate` for pollFolder that hands the file to Reception instead of checking it locally. */
export function receptionValidator(target: ReceptionTarget, opts: WaitOptions = {}) {
  const timeoutMs = opts.timeoutMs ?? 120_000
  const intervalMs = opts.intervalMs ?? 2_000
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  return async (file: RemoteFile, bytes: ArrayBuffer): Promise<ValidationOutcome> => {
    const d = await deliverFile(target.supplierToken, target.requirementSlug, file.name, bytes)
    if (!d.ok) throw new Error(`delivery refused: ${d.error.code}${d.error.message ? ` (${d.error.message})` : ''}`)
    // Reading the verdict needs the receiver's session (the folder is watched
    // from the receiving company's workspace).
    let row: ApiDelivery | undefined
    for (const start = Date.now(); Date.now() - start < timeoutMs; await sleep(intervalMs)) {
      const list = await paidApi.deliveries()
      row = list.ok ? list.value.deliveries.find((x) => x.id === d.value.deliveryId) : undefined
      if (row && row.score !== null) break
      if (row?.verdict === 'rejected') break // rejected before validation (not an IFC, hash mismatch)
    }
    return {
      score: row?.score ?? 0,
      passed: row?.verdict === 'accepted',
      issues: row?.failed_specs ?? 0,
      report: {
        delivery_id: d.value.deliveryId, file_hash: d.value.fileHash, replayed: d.value.replayed,
        verdict: row?.verdict ?? 'pending', reason: row?.reason ?? null, required_score: row?.required_score ?? null,
      },
    }
  }
}
