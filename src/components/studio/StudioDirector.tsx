// ─── Presentation director (Clip Studio) ───────────────────────────────────────
// Pick a template, adjust it, generate: the director reads what the loaded
// models really contain (storeys, systems, findings, the recorded tour),
// plans the shots and renders them into the timeline — where everything stays
// editable. Templates can be saved; with several models loaded the same
// template makes one combined clip, a model-by-model sequence, or a batch of
// one MP4 per model.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as Icons from '../Icons'
import { Modal } from '../Modal'
import { toast } from '../../stores/toastStore'
import { usePresentationStore } from '../../stores/presentationStore'
import { useModelStore } from '../../stores/modelStore'
import { CLIP_TRANSITIONS } from '../../lib/capture/project'
import { BUILTIN_BED_IDS } from '../../lib/capture/audio-library'
import {
  CAPTION_LOOK_IDS, MULTI_MODEL_MODES, OUTPUT_FORMATS, PACES, SECTION_KINDS, builtInRecipe, DEFAULT_RECIPE_ID,
  type Recipe, type SectionKind,
} from '../../lib/director/recipe'
import { allRecipes, deleteRecipe, lastRecipeId, rememberRecipe, saveRecipe } from '../../lib/director/storage'
import { generatePresentation, inspectScene, NothingToPresentError, type GenerateLabels } from '../../lib/director/generate'
import { planPresentation, type SceneFacts } from '../../lib/director/plan'
import { rhythmForMusic } from '../../lib/director/run'
import type { SystemKey } from '../../lib/director/systems'

interface Props {
  run: (fn: (signal: AbortSignal) => Promise<void>) => Promise<void>
  busy: boolean
  canRender: boolean
}

export function useDirectorLabels(): GenerateLabels {
  const { t } = useTranslation('capture')
  return useMemo(() => ({
    analysing: t('studio.director.analysing'),
    rendering: (clip, clips, shot, shots) => clips > 1
      ? t('studio.director.renderingBatch', { clip, clips, shot, shots })
      : t('studio.rendering', { i: shot, n: shots }),
    exporting: (clip, clips) => t('studio.director.exportingBatch', { clip, clips }),
    system: (key: SystemKey) => t(`studio.director.systems.${key}`),
    plan: {
      stats: (elements, storeys) => storeys > 0
        ? t('studio.director.statsStoreys', { elements: elements.toLocaleString(), storeys })
        : t('studio.director.stats', { elements: elements.toLocaleString() }),
      score: (score) => t('studio.director.score', { score }),
      system: (label, count) => t('studio.director.systemCaption', { label, count: count.toLocaleString() }),
      issue: (label, count) => t('studio.director.issueCaption', { label, count }),
      tourStop: (i) => t('studio.director.tourStop', { i }),
      together: t('studio.director.together'),
      ids: (label, count) => t('studio.director.idsCaption', { label, count }),
      fixed: (label, count) => t('studio.director.fixedCaption', { label, count }),
      fixedSummary: (resolved, before, after) => before !== null && after !== null
        ? t('studio.director.fixedSummaryScore', { resolved, before, after })
        : t('studio.director.fixedSummary', { resolved }),
    },
    review: {
      more: (n) => t('studio.director.more', { n }),
      howToFix: t('studio.director.howToFix'),
      unassigned: t('studio.director.unassigned'),
    },
  }), [t])
}

/** Run a recipe with the right toasts — shared by the studio and the tour player. */
export async function runRecipe(recipe: Recipe, lang: string, labels: GenerateLabels, t: (k: string, o?: Record<string, unknown>) => string, signal: AbortSignal) {
  try {
    const r = await generatePresentation(recipe, lang, labels, signal)
    if (r.exported > 0) toast(t('studio.director.batchDone', { n: r.exported }), 'success')
    else if (r.reused > 0) toast(t('studio.director.reused', { n: r.reused }), 'info')
  } catch (e) {
    if (e instanceof NothingToPresentError) { toast(t('studio.needModel'), 'warning'); return }
    throw e
  }
}

export function StudioDirector({ run, busy, canRender }: Props) {
  const { t, i18n } = useTranslation('capture')
  const labels = useDirectorLabels()
  const [recipes, setRecipes] = useState<Recipe[]>(allRecipes)
  const [selectedId, setSelectedId] = useState<string>(() => lastRecipeId())
  const selected = recipes.find((r) => r.id === selectedId) ?? builtInRecipe(DEFAULT_RECIPE_ID)!
  const [editing, setEditing] = useState<Recipe | null>(null)

  const nameOf = useCallback((r: Recipe) => (r.builtIn ? t(`studio.director.recipes.${r.id}` as 'studio.director.recipes.reel') : r.name), [t])

  const choose = (id: string) => { setSelectedId(id); rememberRecipe(id) }

  const generate = (recipe: Recipe) => run((signal) => runRecipe(recipe, i18n.language, labels, t as never, signal))

  return (
    <section className="flex flex-col gap-2">
      <h3 className="studio-h">{t('studio.director.title')}</h3>
      <p className="text-[11.5px] leading-relaxed text-[var(--text-faint)]">{t('studio.director.hint')}</p>
      <label className="sr-only" htmlFor="director-recipe">{t('studio.director.template')}</label>
      <select id="director-recipe" className="studio-input" value={selected.id} onChange={(e) => choose(e.target.value)}>
        <optgroup label={t('studio.director.builtIn')}>
          {recipes.filter((r) => r.builtIn).map((r) => <option key={r.id} value={r.id}>{nameOf(r)}</option>)}
        </optgroup>
        {recipes.some((r) => !r.builtIn) && (
          <optgroup label={t('studio.director.mine')}>
            {recipes.filter((r) => !r.builtIn).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </optgroup>
        )}
      </select>
      <p className="text-[11px] text-[var(--text-dim)]">
        {t(`studio.platforms.${selected.format}`)} · ~{selected.targetSec}s · {t(`studio.director.pace.${selected.pace}`)}
      </p>
      <div className="grid grid-cols-[1fr_auto] gap-1.5">
        <button type="button" className="studio-btn studio-btn--accent justify-center" disabled={!canRender || busy} onClick={() => generate(selected)}>
          <Icons.Sparkles size={14} aria-hidden="true" /> {t('studio.director.generate')}
        </button>
        <button type="button" className="studio-icon-btn" style={{ height: 'auto' }} disabled={busy} onClick={() => setEditing({ ...selected })} aria-label={t('studio.director.customize')} title={t('studio.director.customize')}>
          <Icons.Sliders size={14} aria-hidden="true" />
        </button>
      </div>
      {!canRender && <p className="text-[11px] text-[var(--text-faint)]">{t('studio.needModel')}</p>}

      {editing && (
        <DirectorEditor
          draft={editing}
          nameOf={nameOf}
          onChange={setEditing}
          onClose={() => setEditing(null)}
          onGenerate={(r) => { setEditing(null); void generate(r) }}
          onSave={(r) => {
            const saved = saveRecipe({ ...r, name: r.builtIn ? `${nameOf(r)} *` : r.name })
            setRecipes(allRecipes())
            choose(saved.id)
            setEditing(saved)
            toast(t('studio.director.saved'), 'success')
          }}
          onDelete={(r) => {
            deleteRecipe(r.id)
            setRecipes(allRecipes())
            choose(DEFAULT_RECIPE_ID)
            setEditing(null)
          }}
          canRender={canRender && !busy}
        />
      )}
    </section>
  )
}

// ── Editor ─────────────────────────────────────────────────────────────────────

function DirectorEditor({ draft, nameOf, onChange, onClose, onGenerate, onSave, onDelete, canRender }: {
  draft: Recipe
  nameOf: (r: Recipe) => string
  onChange: (r: Recipe) => void
  onClose: () => void
  onGenerate: (r: Recipe) => void
  onSave: (r: Recipe) => void
  onDelete: (r: Recipe) => void
  canRender: boolean
}) {
  const { t, i18n } = useTranslation('capture')
  const [facts, setFacts] = useState<SceneFacts | null>(null)
  const modelCount = useModelStore((s) => Object.keys(s.models).length)
  const tourStops = usePresentationStore((s) => s.tour?.steps.length ?? 0)
  const labels = useDirectorLabels()
  // The plan is pure and cheap: re-planned on every change, before anything renders.
  const plan = useMemo(() => (facts ? planPresentation(draft, facts, labels.plan, rhythmForMusic(draft.music)) : null), [facts, draft, labels])
  const set = (patch: Partial<Recipe>) => onChange({ ...draft, ...patch })
  const setCap = (patch: Partial<Recipe['captions']>) => onChange({ ...draft, captions: { ...draft.captions, ...patch } })

  // What the loaded models offer each section — so a toggle never silently does nothing.
  useEffect(() => {
    let live = true
    void inspectScene(i18n.language, (k) => t(`studio.director.systems.${k}`), labels.review).then((f) => { if (live) setFacts(f) })
    return () => { live = false }
  }, [i18n.language, t])

  const offer = (k: SectionKind): { n: number | null } => {
    if (!facts) return { n: null }
    const sum = (f: (m: SceneFacts['models'][number]) => number) => facts.models.reduce((s, m) => s + f(m), 0)
    switch (k) {
      case 'storeys': return { n: Math.min(draft.maxStoreys, sum((m) => m.storeys.length)) }
      case 'buildup': return { n: facts.models.some((m) => m.storeys.length >= 3) ? 1 : 0 }
      case 'systems': return { n: Math.min(draft.maxSystems, sum((m) => m.systems.length)) }
      case 'issues': return { n: Math.min(draft.maxIssues, sum((m) => m.issues.length)) }
      case 'tour': return { n: tourStops }
      case 'ids': return { n: Math.min(draft.maxIssues, sum((m) => m.ids?.length ?? 0)) }
      case 'bcf': return { n: Math.min(draft.maxIssues, sum((m) => m.bcf?.length ?? 0)) }
      case 'fixed': return { n: Math.min(draft.maxIssues, sum((m) => m.fixed?.length ?? 0)) }
      default: return { n: 1 }
    }
  }

  const toggleSection = (k: SectionKind) => {
    const has = draft.sections.includes(k)
    set({ sections: has ? draft.sections.filter((s) => s !== k) : [...draft.sections, k] })
  }
  const moveSection = (k: SectionKind, dir: -1 | 1) => {
    const list = [...draft.sections]
    const i = list.indexOf(k)
    const j = i + dir
    if (i < 0 || j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    set({ sections: list })
  }

  const unused = SECTION_KINDS.filter((k) => !draft.sections.includes(k))

  return (
    <Modal
      open
      onClose={onClose}
      title={t('studio.director.customize')}
      size="lg"
      className="studio-root"
      footer={
        <div className="flex flex-wrap items-center gap-2">
          {!draft.builtIn && draft.id.startsWith('custom-') && (
            <button type="button" className="studio-btn" onClick={() => onDelete(draft)}><Icons.Trash size={14} aria-hidden="true" /> {t('studio.director.deleteTemplate')}</button>
          )}
          <button type="button" className="studio-btn ml-auto" onClick={() => onSave(draft)}>{t('studio.director.save')}</button>
          <button type="button" className="studio-btn studio-btn--accent" disabled={!canRender || draft.sections.length === 0} onClick={() => onGenerate(draft)}>
            <Icons.Sparkles size={14} aria-hidden="true" />
            {modelCount > 1 && draft.multiModel === 'separate' ? t('studio.director.generateBatch', { n: modelCount }) : t('studio.director.generate')}
          </button>
        </div>
      }
    >
      <div className="studio-director-body">
        {/* Left: structure */}
        <div className="flex flex-col gap-4">
          <Field label={t('studio.director.name')}>
            <input className="studio-input" value={draft.builtIn ? nameOf(draft) : draft.name} maxLength={60}
              onChange={(e) => set({ name: e.target.value, builtIn: false, id: draft.builtIn ? 'new' : draft.id })} />
          </Field>

          <Field label={t('studio.director.sections')} hint={t('studio.director.sectionsHint')}>
            <ol className="flex flex-col gap-1" role="list">
              {draft.sections.map((k, i) => {
                const { n } = offer(k)
                const empty = n === 0
                return (
                  <li key={k} className={`studio-director-row${empty ? ' is-empty' : ''}`}>
                    <span className="w-5 text-center font-mono text-[10px] text-[var(--text-faint)]">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-medium">{t(`studio.director.section.${k}`)}</span>
                      <span className="block truncate text-[10.5px] text-[var(--text-faint)]">
                        {n === null ? '…' : empty ? t(`studio.director.empty.${k}` as 'studio.director.empty.tour', { defaultValue: t('studio.director.emptyGeneric') }) : n > 1 ? t('studio.director.shots', { n }) : t(`studio.director.sectionHint.${k}`)}
                      </span>
                    </span>
                    <button type="button" className="studio-icon-btn" disabled={i === 0} onClick={() => moveSection(k, -1)} aria-label={t('studio.director.moveUp')}><Icons.Chevron size={12} style={{ transform: 'rotate(-90deg)' }} /></button>
                    <button type="button" className="studio-icon-btn" disabled={i === draft.sections.length - 1} onClick={() => moveSection(k, 1)} aria-label={t('studio.director.moveDown')}><Icons.Chevron size={12} style={{ transform: 'rotate(90deg)' }} /></button>
                    <button type="button" className="studio-icon-btn" onClick={() => toggleSection(k)} aria-label={t('studio.delete')}><Icons.X size={12} /></button>
                  </li>
                )
              })}
            </ol>
            {unused.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {unused.map((k) => (
                  <button key={k} type="button" className="studio-chip" onClick={() => toggleSection(k)}>
                    <Icons.Plus size={11} aria-hidden="true" /> {t(`studio.director.section.${k}`)}
                  </button>
                ))}
              </div>
            )}
          </Field>

          <div className="grid grid-cols-3 gap-2">
            <Num label={t('studio.director.maxStoreys')} value={draft.maxStoreys} min={1} max={20} onChange={(v) => set({ maxStoreys: v })} />
            <Num label={t('studio.director.maxSystems')} value={draft.maxSystems} min={1} max={4} onChange={(v) => set({ maxSystems: v })} />
            <Num label={t('studio.director.maxIssues')} value={draft.maxIssues} min={1} max={12} onChange={(v) => set({ maxIssues: v })} />
          </div>
          <Toggle label={t('studio.director.isolate')} hint={t('studio.director.isolateHint')} checked={draft.isolateSubjects} onChange={(v) => set({ isolateSubjects: v })} />

          {modelCount > 1 && (
            <Field label={t('studio.director.multi')} hint={t(`studio.director.multiHint.${draft.multiModel}`)}>
              <Chips value={draft.multiModel} options={MULTI_MODEL_MODES} label={(m) => t(`studio.director.multiMode.${m}`)} onChange={(m) => set({ multiModel: m })} />
            </Field>
          )}
        </div>

        {/* Right: look and sound */}
        <div className="flex flex-col gap-4">
          <Field label={t('studio.director.storyboard')}>
            {plan === null ? (
              <span className="text-[11.5px] text-[var(--text-faint)]">…</span>
            ) : plan.length === 0 ? (
              <span className="text-[11.5px] text-[var(--text-faint)]">{t('studio.needModel')}</span>
            ) : (
              <>
                <span className="text-[12px] text-[var(--text-dim)]">
                  {plan.length > 1
                    ? t('studio.director.storyboardBatch', { clips: plan.length, shots: plan[0].shots.length, seconds: Math.round(plan[0].durationSec) })
                    : t('studio.director.storyboardSummary', { shots: plan[0].shots.length, seconds: Math.round(plan[0].durationSec) })}
                </span>
                <div className="studio-storyboard" role="list">
                  {plan[0].shots.map((sh, i) => (
                    <span key={i} role="listitem" className={`studio-storyboard-shot is-${sh.section}`}
                      style={{ flexGrow: sh.shot.durationSec }}
                      title={`${i + 1}. ${t(`studio.director.section.${sh.section}`)} — ${sh.label} · ${sh.shot.durationSec.toFixed(1)}s`}>
                      <span className="sr-only">{`${t(`studio.director.section.${sh.section}`)} ${sh.shot.durationSec.toFixed(1)}s`}</span>
                    </span>
                  ))}
                </div>
              </>
            )}
          </Field>
          <Field label={t('studio.format')}>
            <Chips value={draft.format} options={OUTPUT_FORMATS} label={(f) => t(`studio.platforms.${f}`)} onChange={(f) => set({ format: f })} />
          </Field>
          <Field label={t('studio.director.length', { seconds: draft.targetSec })}>
            <input type="range" className="studio-range" min={6} max={120} step={1} value={draft.targetSec} onChange={(e) => set({ targetSec: Number(e.target.value) })} />
          </Field>
          <Field label={t('studio.director.paceLabel')}>
            <Chips value={draft.pace} options={PACES} label={(p) => t(`studio.director.pace.${p}`)} onChange={(p) => set({ pace: p })} />
          </Field>
          <Field label={t('studio.transition')}>
            <div className="grid grid-cols-[1fr_96px] gap-2">
              <select className="studio-input" value={draft.transition} onChange={(e) => set({ transition: e.target.value as Recipe['transition'] })}>
                {CLIP_TRANSITIONS.map((tr) => <option key={tr} value={tr}>{t(`studio.transitions.${tr}`)}</option>)}
              </select>
              <select className="studio-input" value={draft.transitionSec} disabled={draft.transition === 'cut'} onChange={(e) => set({ transitionSec: Number(e.target.value) })} aria-label={t('studio.transitionDuration')}>
                {[0.25, 0.3, 0.4, 0.5, 0.6, 0.8, 1, 1.2].map((v) => <option key={v} value={v}>{v}s</option>)}
              </select>
            </div>
          </Field>
          <Field label={t('studio.music')}>
            <select className="studio-input" value={draft.music} onChange={(e) => set({ music: e.target.value as Recipe['music'] })}>
              <option value="none">{t('studio.musicNone')}</option>
              {BUILTIN_BED_IDS.map((b) => <option key={b} value={b}>{t(`editor.beds.${b}`)}</option>)}
            </select>
            {draft.music !== 'none' && (
              <Toggle label={t('studio.snapToBeat')} checked={draft.onBeat} onChange={(v) => set({ onBeat: v })} />
            )}
          </Field>

          <Field label={t('studio.director.captions')}>
            <Toggle label={t('studio.director.captionsOn')} checked={draft.captions.enabled} onChange={(v) => setCap({ enabled: v })} />
            {draft.captions.enabled && (
              <div className="mt-1 flex flex-col gap-2">
                <Chips value={draft.captions.look ?? 'clean'} options={CAPTION_LOOK_IDS} label={(l) => t(`studio.director.looks.${l}`)} onChange={(l) => setCap({ look: l })} />
                <input className="studio-input" value={draft.captions.title} maxLength={80} placeholder={t('studio.director.titlePlaceholder')} onChange={(e) => setCap({ title: e.target.value })} aria-label={t('studio.director.titleLabel')} />
                <Toggle label={t('studio.director.showStats')} checked={draft.captions.showStats} onChange={(v) => setCap({ showStats: v })} />
                <Toggle label={t('studio.director.showScore')} hint={t('studio.director.showScoreHint')} checked={draft.captions.showScore} onChange={(v) => setCap({ showScore: v })} />
                <Toggle label={t('studio.director.showDetails')} hint={t('studio.director.showDetailsHint')} checked={!!draft.captions.details} onChange={(v) => setCap({ details: v })} />
                <Toggle label={t('studio.director.labelShots')} checked={draft.captions.labelShots} onChange={(v) => setCap({ labelShots: v })} />
                <input className="studio-input" value={draft.captions.cta} maxLength={80} placeholder={t('studio.director.ctaPlaceholder')} onChange={(e) => setCap({ cta: e.target.value })} aria-label={t('studio.director.cta')} />
              </div>
            )}
          </Field>
          <div className="flex flex-col gap-1">
            <Toggle label={t('studio.director.fadeIn')} checked={draft.fadeIn} onChange={(v) => set({ fadeIn: v })} />
            <Toggle label={t('studio.director.fadeOut')} checked={draft.fadeOut} onChange={(v) => set({ fadeOut: v })} />
            <Toggle label={t('studio.watermark')} checked={draft.watermark} onChange={(v) => set({ watermark: v })} />
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ── Small controls ─────────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="studio-h">{label}</span>
      {children}
      {hint && <span className="text-[11px] leading-relaxed text-[var(--text-faint)]">{hint}</span>}
    </div>
  )
}

function Chips<T extends string>({ value, options, label, onChange }: { value: T; options: readonly T[]; label: (v: T) => string; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button key={o} type="button" className="studio-chip" aria-pressed={value === o} onClick={() => onChange(o)}>{label(o)}</button>
      ))}
    </div>
  )
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 py-0.5 text-[12.5px] text-[var(--text-dim)]">
      <input type="checkbox" className="mt-0.5 accent-[var(--accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {hint && <span className="block text-[11px] text-[var(--text-faint)]">{hint}</span>}
      </span>
    </label>
  )
}

function Num({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10.5px] text-[var(--text-faint)]">{label}</span>
      <input type="number" className="studio-input" min={min} max={max} value={value}
        onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, Math.round(v)))) }} />
    </label>
  )
}
