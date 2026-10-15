// ─── SceneStory ───────────────────────────────────────────────────────────────
// The guided tour a scene can carry (lib/scene-doc/scene-story.ts), shown over
// the canvas where SceneExplorer runs.
//
// A digital twin is easy to open and hard to read: a 3D model with coloured
// posts says nothing to someone who does not know what the colours are, where
// the data comes from, or why it matters. The tour says it, in a few steps,
// next to the thing it is about: the camera goes there, and the text quotes
// the live value of what the step points at ("right now: 9 bikes"), so the
// value of the twin is visible in the first minute instead of left to guess.
//
// It never takes over: the first step keeps the scene's own view, the camera
// moves only when the reader asks for the next step, it folds into a pill
// with ×, and it steps aside on phones while an element's card is open.
//
// Next waits for the scene to settle: its start view lands once the models
// are in (App's presentation shot, 400 ms after the loads go quiet), and a
// step taken before that was undone under the reader's eyes.

import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ViewerAPI } from '../lib/viewer'
import type { SceneStory as Story } from '../lib/scene-doc/scene-story'
import { fillStoryText, pickText } from '../lib/scene-doc/scene-story'
import { useTwinDeviceStore, selectShownReadings } from '../stores/twinDeviceStore'
import { useValidationStore } from '../stores/validationStore'
import { buildCatalog, buildGuidIndex, resolveLocs } from '../lib/twin/devices'
import { bindingItems } from '../lib/scene-explore/explore-items'
import { focusElements } from '../lib/scene-explore/focus'
import { useLoadingStore } from '../stores/loadingStore'
import { useSceneStore } from '../stores/sceneStore'

/** Quiet after the last load before a step may move the camera. */
const SETTLE_MS = 1000

interface Props {
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
  story: Story
  /** An element's card is open: on a phone the tour gets out of its way. */
  cardOpen: boolean
}

export default function SceneStory({ viewerApiRef, story, cardOpen }: Props) {
  const { t, i18n } = useTranslation(['viewer', 'common'])
  const [index, setIndex] = useState(0)
  const [open, setOpen] = useState(true)
  const bindings = useTwinDeviceStore((s) => s.bindings)
  const readings = useTwinDeviceStore(selectShownReadings)
  const timeAt = useTwinDeviceStore((s) => s.timeAt)
  const trees = useValidationStore((s) => s.spatialTrees)
  const now = timeAt ?? Date.now()
  const items = useMemo(() => bindingItems(bindings, readings, now), [bindings, readings, now])

  const steps = story.steps
  const step = steps[Math.min(index, steps.length - 1)]
  const item = step.binding ? items.find((it) => it.id === step.binding) ?? null : null
  const lang = i18n.language || 'en'

  const loadsActive = useLoadingStore((s) => s.summary.managedActive > 0)
  const hasModels = useSceneStore((s) => s.models.length > 0)
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    if (settled || loadsActive || !hasModels) return
    const timer = window.setTimeout(() => setSettled(true), SETTLE_MS)
    return () => window.clearTimeout(timer)
  }, [settled, loadsActive, hasModels])

  const goTo = async (i: number): Promise<void> => {
    const next = steps[i]
    if (!next) return
    setIndex(i)
    const v = viewerApiRef.current
    if (!v) return
    if (next.camera) {
      const [px, py, pz] = next.camera.position
      const [tx, ty, tz] = next.camera.target
      v.setCameraLookAt({ x: px, y: py, z: pz }, { x: tx, y: ty, z: tz }, true)
      return
    }
    if (next.binding) {
      const b = bindings.find((x) => x.id === next.binding)
      if (!b) return
      const locs = resolveLocs(b, buildGuidIndex(trees), buildCatalog(trees))
      if (!locs.length) return
      const modelId = locs[0].modelId
      await focusElements(v, locs.filter((l) => l.modelId === modelId).map((l) => l.expressId).slice(0, 500), modelId)
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} data-testid="scene-story-resume"
        className="absolute z-[22] bottom-12 left-1/2 -translate-x-1/2 max-sm:bottom-[4.5rem] pointer-events-auto flex items-center gap-1.5 h-8 px-3 rounded-full border border-[var(--border)] bg-[rgba(14,15,20,0.88)] backdrop-blur-[8px] shadow-lg text-[12px] font-medium text-[var(--text)] hover:border-[var(--accent)]">
        <span aria-hidden>▶</span>{t('explorer.story.resume')}
      </button>
    )
  }
  // On a phone the element's card is a bottom sheet: the tour would sit on it.
  const hiddenOnPhone = cardOpen ? 'max-sm:hidden' : ''

  return (
    <section
      className={`absolute z-[22] bottom-12 left-1/2 -translate-x-1/2 w-[min(460px,calc(100%-1rem))] max-sm:bottom-[4.5rem] ${hiddenOnPhone}
        pointer-events-auto rounded-[14px] border border-[var(--border)] bg-[rgba(14,15,20,0.94)] backdrop-blur-[10px] shadow-2xl text-[var(--text)]`}
      aria-label={t('explorer.story.label')} data-testid="scene-story">
      <div className="flex items-center gap-2 px-3.5 pt-3">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[var(--accent)]">{t('explorer.story.label')}</span>
        <span className="text-[10.5px] text-[var(--text-faint)] tabular-nums">{t('explorer.story.step', { n: index + 1, total: steps.length })}</span>
        <span className="flex-1" />
        <button type="button" onClick={() => setOpen(false)} aria-label={t('explorer.story.close')} title={t('explorer.story.close')}
          className="w-7 h-7 -mr-1 flex items-center justify-center rounded-[7px] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-white/[0.06]">×</button>
      </div>
      <div className="px-3.5 pt-1 pb-3" aria-live="polite">
        <h3 className="text-[15px] font-semibold leading-snug" data-testid="scene-story-title">{pickText(step.title, lang)}</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-dim)]" data-testid="scene-story-text">
          {fillStoryText(pickText(step.text, lang), item?.value ?? null)}
        </p>
        {item && (
          <div className="mt-2 inline-flex items-center gap-2 h-7 px-2.5 rounded-full bg-white/[0.05] border border-white/10 text-[11.5px]" data-testid="scene-story-live">
            <span className={`w-2 h-2 rounded-full ${item.state === 'live' ? 'animate-pulse' : ''}`} style={{ background: item.state === 'live' ? (item.color ?? '#22c55e') : '#8a8f98' }} aria-hidden />
            <span className="text-[var(--text-faint)]">{item.state === 'live' ? t('explorer.story.now') : t(`explorer.state.${item.state}`)}</span>
            {item.value !== null && <span className="font-mono tabular-nums text-[var(--text)]">{item.value}</span>}
            {item.state === 'live' && item.ruleName && <span className="text-[var(--text-dim)] truncate max-w-[180px]">· {item.ruleName}</span>}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 px-3 pb-3">
        <div className="flex items-center gap-1 mr-auto" aria-hidden>
          {steps.map((_, i) => <span key={i} className={`h-1.5 rounded-full transition-all ${i === index ? 'w-4 bg-[var(--accent)]' : 'w-1.5 bg-white/20'}`} />)}
        </div>
        {index > 0 && (
          <button type="button" onClick={() => void goTo(index - 1)} data-testid="scene-story-back"
            className="h-8 px-3 rounded-[8px] text-[12px] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-white/[0.06]">{t('explorer.story.back')}</button>
        )}
        {index < steps.length - 1 ? (
          <button type="button" onClick={() => void goTo(index + 1)} data-testid="scene-story-next" autoFocus disabled={!settled}
            className="h-8 px-3.5 rounded-[8px] text-[12px] font-semibold text-white disabled:opacity-60 disabled:cursor-wait" style={{ background: 'var(--accent)' }}>
            {settled ? t('explorer.story.next') : t('common:status.loading')}
          </button>
        ) : (
          <button type="button" onClick={() => setOpen(false)} data-testid="scene-story-finish"
            className="h-8 px-3.5 rounded-[8px] text-[12px] font-semibold text-white" style={{ background: 'var(--accent)' }}>{t('explorer.story.finish')}</button>
        )}
      </div>
    </section>
  )
}
