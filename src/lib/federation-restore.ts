// ─── Federation restore (runtime) ─────────────────────────────────────────────
// Runs a restore plan: parks what was parked, loads the rest, and when each
// load commits hands the saved state to the applier the app registered (it
// owns the viewer). Works with an empty scene — the app registers the applier
// once at start-up, independent of which panel opened the federation.

import type { FederationManifestV1 } from './federation-manifest'
import { reconcile } from './federation-reconcile'
import { planRestore, modelCountBucket, viewsFromManifest, defaultView, type RestoreApply } from './federation-session'
import { DISCIPLINES, type Discipline, type FederationView, type ViewLook } from './federation'
import { submitIfcFiles } from './loading'
import { trackFeatureUsed } from './analytics'
import { useFederationStore } from '../stores/federationStore'
import { useFederationOpenStore, type FederationOpenSource } from '../stores/federationOpenStore'
import { parseManifest } from './federation-manifest'
import { toast } from '../stores/toastStore'
import i18n from '../i18n/config'

export type RestoreApplier = (modelId: string, apply: RestoreApply) => void
let applier: RestoreApplier | null = null

/** Registered by the app (it has the viewer). Returns an unregister function. */
export function setRestoreApplier(fn: RestoreApplier): () => void {
  applier = fn
  return () => { if (applier === fn) applier = null }
}

/**
 * Camera/section access for saved views, registered by the app (it owns the
 * viewer): `capture` reads the look now, `apply` puts a whole view back
 * (visibility, opacity, colour, camera, cuts) on the models open.
 */
export interface ViewHooks {
  capture: () => ViewLook
  apply: (view: FederationView) => void
}
let viewHooks: ViewHooks | null = null

export function setViewHooks(h: ViewHooks): () => void {
  viewHooks = h
  return () => { if (viewHooks === h) viewHooks = null }
}

/** Camera and cuts now, for a view being saved; {} when no viewer is up. */
export function captureViewLook(): ViewLook {
  try { return viewHooks?.capture() ?? {} } catch { return {} }
}

/** Apply a saved view through the app's viewer, if one is registered. */
export function applyFederationView(view: FederationView): void {
  viewHooks?.apply(view)
}

/** Load `files` as `manifest` describes. Resolves with the missing file names once loads are submitted. */
export async function runFederationRestore(manifest: FederationManifestV1, files: File[], source: FederationOpenSource = 'file'): Promise<string[]> {
  const plan = planRestore(manifest, reconcile(manifest, files.map((f) => ({ name: f.name, size: f.size }))))
  // The file's views join the saved-views list (same name replaces); the
  // default one is shown once every model of the file has settled.
  const views = viewsFromManifest(manifest)
  for (const v of [...views].reverse()) useFederationStore.getState().saveView(v)
  const shown = defaultView(manifest, views)
  trackFeatureUsed({ feature: 'federation_open', models: modelCountBucket(manifest.models.length), source })

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
    const settled = handles.map((h, i) => h.settled.then((out) => {
      if (out.status !== 'loaded') return
      const apply = plan.loads[i].apply
      if (apply.discipline && (DISCIPLINES as string[]).includes(apply.discipline)) {
        useFederationStore.getState().setDiscipline(out.resultId, apply.discipline as Discipline)
      }
      applier?.(out.resultId, apply)
    }))
    if (shown) void Promise.allSettled(settled).then(() => applyFederationView(shown))
  }
  return plan.missing.map((m) => m.fileName)
}

/** Restore with `files` and surface the missing names (toast + store). */
export async function restoreAndReport(manifest: FederationManifestV1, files: File[], source: FederationOpenSource): Promise<void> {
  const open = useFederationOpenStore.getState()
  open.setPending(null)
  const miss = await runFederationRestore(manifest, files, source)
  open.setMissing(miss)
  if (miss.length > 0) toast(`${i18n.t('common:federationFile.missing', { count: miss.length })}: ${miss.join(', ')}`, 'warning')
}

/**
 * Open a `.ifcfed.json` the same way from every door. With IFC files at hand
 * (dropped together) it restores at once; otherwise the manifest waits for
 * the user to choose its files. Resolves with what happened.
 */
export async function openFederationFile(file: File, ifcs: File[], source: FederationOpenSource): Promise<'invalid' | 'pending' | 'restored'> {
  let text: string
  try { text = await file.text() } catch { text = '' }
  const r = parseManifest(text)
  if (!r.ok) { toast(i18n.t('common:federationFile.invalid'), 'error'); return 'invalid' }
  if (ifcs.length > 0) { await restoreAndReport(r.value, ifcs, source); return 'restored' }
  useFederationOpenStore.getState().setMissing([])
  useFederationOpenStore.getState().setPending({ manifest: r.value, source })
  return 'pending'
}
