// ─── Federation restore (runtime) ─────────────────────────────────────────────
// Runs a restore plan: parks what was parked, loads the rest, and when each
// load commits hands the saved state to the applier the app registered (it
// owns the viewer). Works with an empty scene — the app registers the applier
// once at start-up, independent of which panel opened the federation.

import type { FederationManifestV1 } from './federation-manifest'
import { reconcile } from './federation-reconcile'
import { planRestore, modelCountBucket, type RestoreApply } from './federation-session'
import { DISCIPLINES, type Discipline } from './federation'
import { submitIfcFiles } from './loading'
import { trackFeatureUsed } from './analytics'
import { useFederationStore } from '../stores/federationStore'

export type RestoreApplier = (modelId: string, apply: RestoreApply) => void
let applier: RestoreApplier | null = null

/** Registered by the app (it has the viewer). Returns an unregister function. */
export function setRestoreApplier(fn: RestoreApplier): () => void {
  applier = fn
  return () => { if (applier === fn) applier = null }
}

/** Load `files` as `manifest` describes. Resolves with the missing file names once loads are submitted. */
export async function runFederationRestore(manifest: FederationManifestV1, files: File[]): Promise<string[]> {
  const plan = planRestore(manifest, reconcile(manifest, files.map((f) => ({ name: f.name, size: f.size }))))
  trackFeatureUsed({ feature: 'federation_open', models: modelCountBucket(manifest.models.length) })

  const fed = useFederationStore.getState()
  fed.setColorByDiscipline(plan.colorByDiscipline)
  for (const p of plan.parks) {
    const f = files[p.fileIndex]
    try { fed.park(f.name, await f.arrayBuffer()) } catch { /* unreadable: skip */ }
  }
  if (plan.loads.length > 0) {
    const handles = submitIfcFiles(plan.loads.map((l) => files[l.fileIndex]), {
      origin: 'upload', batchName: manifest.name || null,
    })
    handles.forEach((h, i) => {
      void h.settled.then((out) => {
        if (out.status !== 'loaded') return
        const apply = plan.loads[i].apply
        if (apply.discipline && (DISCIPLINES as string[]).includes(apply.discipline)) {
          useFederationStore.getState().setDiscipline(out.resultId, apply.discipline as Discipline)
        }
        applier?.(out.resultId, apply)
      })
    })
  }
  return plan.missing.map((m) => m.fileName)
}
