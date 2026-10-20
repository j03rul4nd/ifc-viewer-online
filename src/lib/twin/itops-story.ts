// ─── itops-story ──────────────────────────────────────────────────────────────
// The guided tour of the office-IT twin demo (`?twin=itops`), in the scene
// story format (scene-doc/scene-story.ts) so SceneStory shows it like a
// scene's own. The demo is a model link, not a scene file, and its binding ids
// are minted when the template is applied, so the steps are built here from
// the bindings' device ids, with text in the visitor's language.

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useTwinDeviceStore } from '../../stores/twinDeviceStore'
import { SIM_ITOPS_URL } from './device-sim'
import type { SceneStory, SceneStoryStep } from '../scene-doc/scene-story'

const STEPS: Array<{ key: 'live' | 'server' | 'wifi' | 'security' | 'value'; device?: string }> = [
  { key: 'live' },
  { key: 'server', device: 'server-room' },
  { key: 'wifi', device: 'ap-1' },
  { key: 'security', device: 'badge-main' },
  { key: 'value' },
]

/** The tour, once the office-IT template is applied; null otherwise. */
export function useItOpsStory(): SceneStory | null {
  const { t, i18n } = useTranslation('viewer')
  const sources = useTwinDeviceStore((s) => s.sources)
  const bindings = useTwinDeviceStore((s) => s.bindings)
  return useMemo(() => {
    const src = sources.find((s) => s.url === SIM_ITOPS_URL)
    if (!src) return null
    const mine = bindings.filter((b) => b.sourceId === src.id)
    if (!mine.length) return null
    const steps = STEPS.map(({ key, device }): SceneStoryStep => {
      const b = device ? mine.find((x) => x.deviceId === device) : undefined
      return {
        title: t(`explorer.itops.story.${key}.title`),
        text: t(`explorer.itops.story.${key}.text`),
        ...(b ? { binding: b.id } : {}),
      }
    })
    return { steps }
  // i18n.language: the text follows a language switch.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources, bindings, t, i18n.language])
}
