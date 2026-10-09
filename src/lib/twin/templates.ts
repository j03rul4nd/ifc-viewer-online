// ─── templates ────────────────────────────────────────────────────────────────
// One click from "I have an IFC open" to "my building is live": add the
// simulated source of a template and bind its devices to what the loaded
// models contain, with names in the user's language. Also the entry point of
// the gallery's twin demos and of the `?twin=home|community` link.

import { useTwinDeviceStore } from '../../stores/twinDeviceStore'
import { useValidationStore } from '../../stores/validationStore'
import { simulatedSource, templateBindings, TEMPLATE_NAMES_EN, type TemplateNames, type TwinTemplateId } from './device-sim'
import i18n from '../../i18n/config'

export const TWIN_TEMPLATES: TwinTemplateId[] = ['home', 'community']

export function templateNames(): TemplateNames {
  const t = i18n.getFixedT(null, 'layers', 'devices.tpl')
  const out = { ...TEMPLATE_NAMES_EN }
  for (const k of Object.keys(out) as Array<keyof TemplateNames>) {
    const v = t(k)
    if (v && v !== k && !v.endsWith(`.${k}`)) out[k] = v
  }
  return out
}

/** Add the template's source and bindings. Returns how many bindings were made. */
export function applyTemplate(id: TwinTemplateId): number {
  const trees = useValidationStore.getState().spatialTrees
  const names = templateNames()
  const src = simulatedSource(id, names)
  const store = useTwinDeviceStore.getState()
  // One simulated source per template: a second click re-binds instead of duplicating.
  for (const old of store.sources.filter((s) => s.url === src.url)) store.removeSource(old.id)
  const bindings = templateBindings(id, trees, src.id, names)
  store.upsertSource(src)
  bindings.forEach((b) => store.upsertBinding(b))
  store.setActive(true)
  store.setPanelOpen(true)
  return bindings.length
}

/**
 * Apply a template once models have loaded (gallery demo, shared link). Waits
 * for the spatial trees to stop changing, up to `timeoutMs`.
 */
export function applyTemplateWhenLoaded(id: TwinTemplateId, minModels = 1, timeoutMs = 120_000): Promise<number> {
  return new Promise((resolve) => {
    let settle: ReturnType<typeof setTimeout> | null = null
    const done = (): void => {
      unsub(); clearTimeout(giveUp)
      resolve(applyTemplate(id))
    }
    const check = (): void => {
      if (Object.keys(useValidationStore.getState().spatialTrees).length < minModels) return
      if (settle) clearTimeout(settle)
      // Several files of a set land one after another: wait for a quiet second.
      settle = setTimeout(done, 1500)
    }
    const unsub = useValidationStore.subscribe((s, prev) => { if (s.spatialTrees !== prev.spatialTrees) check() })
    const giveUp = setTimeout(() => { unsub(); if (settle) clearTimeout(settle); resolve(0) }, timeoutMs)
    check()
  })
}

export function parseTwinParam(search: string): TwinTemplateId | null {
  const v = new URLSearchParams(search).get('twin')
  return v === 'home' || v === 'community' ? v : null
}
