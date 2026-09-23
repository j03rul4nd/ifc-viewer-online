// ─── Clip Studio inspector ─────────────────────────────────────────────────────
// Edits whatever is selected on the timeline; with nothing selected it shows
// the project: format, music, fades, cut-on-the-beat.

import { useTranslation } from 'react-i18next'
import { useClipStudioStore, OUTPUT_PRESETS, type OutputPreset } from '../../stores/clipStudioStore'
import {
  CLIP_TRANSITIONS, MAX_SPEED, MAX_TRANSITION_SEC, MIN_SPEED, setAllTransitions, snapCutsToBeats, updateClip,
  type Clip, type ClipTransition, type EditProject, type Framing, type MediaOverlay,
} from '../../lib/capture/project'
import { MEDIA_ANIMS, TEXT_ANCHORS, TEXT_ANIMS, TEXT_STYLES, type TextOverlay } from '../../lib/capture/timeline'
import { BUILTIN_BED_IDS, type BuiltInBedId } from '../../lib/capture/audio-library'
import { rhythmFor } from '../../lib/capture/studio-actions'

const SPEEDS = [0.5, 1, 1.5, 2, 3]
const COLORS = ['#ffffff', '#0b0d1a', '#ffd84d', '#ff4d6d', '#4dd2ff', '#7cff8a']

export function StudioInspector() {
  const { t } = useTranslation('capture')
  const selection = useClipStudioStore((s) => s.selection)
  const project = useClipStudioStore((s) => s.project)

  const clip = selection?.kind === 'clip' ? project.clips.find((c) => c.id === selection.id) : undefined
  const text = selection?.kind === 'text' ? project.texts.find((c) => c.id === selection.id) : undefined
  const overlay = selection?.kind === 'overlay' ? project.overlays.find((c) => c.id === selection.id) : undefined

  return (
    <div className="studio-inspector flex flex-col gap-5 overflow-y-auto p-4 text-[12.5px]">
      {clip ? <ClipPanel clip={clip} isFirst={project.clips[0]?.id === clip.id} />
        : text ? <TextPanel text={text} />
          : overlay ? <OverlayPanel overlay={overlay} />
            : <ProjectPanel />}
      {!clip && !text && !overlay && project.clips.length > 0 && (
        <p className="text-[11.5px] leading-relaxed text-[var(--text-faint)]">{t('studio.selectHint')}</p>
      )}
    </div>
  )
}

// ── Small controls ─────────────────────────────────────────────────────────────

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[var(--text-faint)]">{title}</h3>
      {children}
      {hint && <p className="text-[11px] leading-relaxed text-[var(--text-faint)]">{hint}</p>}
    </section>
  )
}

function Chips<T extends string | number>({ value, options, label, onChange }: {
  value: T
  options: readonly T[]
  label: (v: T) => string
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={String(o)} type="button" className="studio-chip" aria-pressed={o === value} onClick={() => onChange(o)}>
          {label(o)}
        </button>
      ))}
    </div>
  )
}

function Slider({ label, value, min, max, step, format, onChange }: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format?: (v: number) => string
  onChange: (v: number) => void
}) {
  const beginGesture = useClipStudioStore((s) => s.beginGesture)
  const endGesture = useClipStudioStore((s) => s.endGesture)
  return (
    <label className="flex flex-col gap-1">
      <span className="flex justify-between text-[11.5px] text-[var(--text-dim)]">
        <span>{label}</span>
        <span className="font-mono tabular-nums">{format ? format(value) : value}</span>
      </span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        className="studio-range"
        onPointerDown={beginGesture} onPointerUp={endGesture} onKeyUp={endGesture}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}

// ── Clip ───────────────────────────────────────────────────────────────────────

function ClipPanel({ clip, isFirst }: { clip: Clip; isFirst: boolean }) {
  const { t } = useTranslation('capture')
  const edit = useClipStudioStore((s) => s.edit)
  const patch = (p: Partial<Clip>) => edit((pr) => updateClip(pr, clip.id, p))
  const framing = (which: 'framingFrom' | 'framingTo', f: Partial<Framing>) => patch({ [which]: { ...clip[which], ...f } } as Partial<Clip>)

  return (
    <>
      <Section title={t('studio.speed')}>
        <Chips value={SPEEDS.includes(clip.speed) ? clip.speed : -1} options={SPEEDS} label={(v) => `${v}×`} onChange={(v) => patch({ speed: v })} />
        <Slider label={t('studio.speed')} value={clip.speed} min={MIN_SPEED} max={MAX_SPEED} step={0.05} format={(v) => `${v.toFixed(2)}×`} onChange={(v) => patch({ speed: v })} />
      </Section>

      <Section title={t('studio.transition')} hint={isFirst ? t('studio.firstClipNoTransition') : undefined}>
        {!isFirst && (
          <>
            <div className="grid grid-cols-2 gap-1.5">
              {CLIP_TRANSITIONS.map((tr) => (
                <button key={tr} type="button" className="studio-chip justify-start" aria-pressed={clip.transition === tr} onClick={() => patch({ transition: tr })}>
                  <TransitionGlyph kind={tr} />
                  {t(`studio.transitions.${tr}`)}
                </button>
              ))}
            </div>
            {clip.transition !== 'cut' && (
              <Slider label={t('studio.transitionDuration')} value={clip.transitionSec} min={0.1} max={MAX_TRANSITION_SEC} step={0.05} format={(v) => `${v.toFixed(2)} s`} onChange={(v) => patch({ transitionSec: v })} />
            )}
            <button type="button" className="studio-link" onClick={() => edit((pr) => setAllTransitions(pr, clip.transition, clip.transitionSec))}>
              {t('studio.applyToAll')}
            </button>
          </>
        )}
      </Section>

      <Section title={t('studio.reframe')} hint={t('studio.reframeHint')}>
        {(['framingFrom', 'framingTo'] as const).map((which) => (
          <div key={which} className="flex flex-col gap-2 rounded-lg border border-[var(--border)] p-2.5">
            <span className="text-[11px] font-medium text-[var(--text-dim)]">{t(which === 'framingFrom' ? 'studio.reframeStart' : 'studio.reframeEnd')}</span>
            <Slider label={t('studio.zoom')} value={clip[which].zoom} min={1} max={3} step={0.05} format={(v) => `${v.toFixed(2)}×`} onChange={(v) => framing(which, { zoom: v })} />
            <Slider label={t('studio.horizontal')} value={clip[which].cx} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => framing(which, { cx: v })} />
            <Slider label={t('studio.vertical')} value={clip[which].cy} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => framing(which, { cy: v })} />
          </div>
        ))}
      </Section>
    </>
  )
}

/** A tiny pictogram of each transition — faster to scan than the words alone. */
function TransitionGlyph({ kind }: { kind: ClipTransition }) {
  const common = { width: 18, height: 12, viewBox: '0 0 18 12', 'aria-hidden': true as const, className: 'shrink-0' }
  switch (kind) {
    case 'cut': return <svg {...common}><rect x="1" y="2" width="7" height="8" rx="1" fill="currentColor" opacity=".5" /><rect x="10" y="2" width="7" height="8" rx="1" fill="currentColor" /></svg>
    case 'crossfade': return <svg {...common}><rect x="1" y="2" width="10" height="8" rx="1" fill="currentColor" opacity=".45" /><rect x="7" y="2" width="10" height="8" rx="1" fill="currentColor" opacity=".75" /></svg>
    case 'dipBlack': return <svg {...common}><rect x="1" y="2" width="16" height="8" rx="1" fill="#000" stroke="currentColor" /></svg>
    case 'dipWhite': return <svg {...common}><rect x="1" y="2" width="16" height="8" rx="1" fill="#fff" stroke="currentColor" /></svg>
    case 'slideLeft': return <svg {...common}><path d="M16 6H3m3-3L3 6l3 3" stroke="currentColor" fill="none" strokeWidth="1.5" /></svg>
    case 'slideUp': return <svg {...common}><path d="M9 11V1M6 4l3-3 3 3" stroke="currentColor" fill="none" strokeWidth="1.5" /></svg>
    case 'zoom': return <svg {...common}><rect x="5" y="3.5" width="8" height="5" rx="1" stroke="currentColor" fill="none" /><rect x="1" y="1" width="16" height="10" rx="1" stroke="currentColor" fill="none" opacity=".5" /></svg>
    case 'whip': return <svg {...common}><path d="M1 3h9M1 6h14M1 9h9" stroke="currentColor" strokeWidth="1.5" /></svg>
  }
}

// ── Text ───────────────────────────────────────────────────────────────────────

function TextPanel({ text }: { text: TextOverlay }) {
  const { t } = useTranslation('capture')
  const edit = useClipStudioStore((s) => s.edit)
  const select = useClipStudioStore((s) => s.select)
  const patch = (p: Partial<TextOverlay>) => edit((pr) => ({ ...pr, texts: pr.texts.map((o) => (o.id === text.id ? { ...o, ...p } : o)) }))

  return (
    <>
      <Section title={t('editor.text.content')}>
        <textarea
          className="studio-input min-h-[72px] resize-y"
          value={text.text}
          placeholder={t('editor.text.placeholder')}
          onChange={(e) => patch({ text: e.target.value })}
        />
      </Section>
      <Section title={t('editor.text.style')}>
        <Chips value={text.style} options={TEXT_STYLES} label={(v) => t(`editor.styles.${v}`)} onChange={(v) => patch({ style: v })} />
      </Section>
      <Section title={t('editor.text.anchor')}>
        <div className="grid w-[132px] grid-cols-3 gap-1" role="group" aria-label={t('editor.text.anchor')}>
          {TEXT_ANCHORS.map((a) => (
            <button key={a} type="button" className="studio-anchor" aria-pressed={text.anchor === a} aria-label={a} onClick={() => patch({ anchor: a })} />
          ))}
        </div>
      </Section>
      <Section title={t('editor.text.anim')}>
        <Chips value={text.anim} options={TEXT_ANIMS} label={(v) => t(`editor.anims.${v}`)} onChange={(v) => patch({ anim: v })} />
      </Section>
      <Section title={t('editor.text.color')}>
        <div className="flex flex-wrap items-center gap-1.5">
          {COLORS.map((c) => (
            <button key={c} type="button" className="studio-swatch" style={{ background: c }} aria-pressed={text.color.toLowerCase() === c} aria-label={c} onClick={() => patch({ color: c })} />
          ))}
          <input type="color" className="studio-swatch" value={text.color} onChange={(e) => patch({ color: e.target.value })} aria-label={t('editor.text.color')} />
        </div>
      </Section>
      <Slider label={t('editor.text.size')} value={text.scale} min={0.5} max={2} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => patch({ scale: v })} />
      <button type="button" className="studio-link text-[var(--danger)]" onClick={() => { edit((pr) => ({ ...pr, texts: pr.texts.filter((o) => o.id !== text.id) })); select(null) }}>
        {t('editor.text.delete')}
      </button>
    </>
  )
}

// ── Overlay ────────────────────────────────────────────────────────────────────

function OverlayPanel({ overlay }: { overlay: MediaOverlay }) {
  const { t } = useTranslation('capture')
  const edit = useClipStudioStore((s) => s.edit)
  const select = useClipStudioStore((s) => s.select)
  const patch = (p: Partial<MediaOverlay>) => edit((pr) => ({ ...pr, overlays: pr.overlays.map((o) => (o.id === overlay.id ? { ...o, ...p } : o)) }))
  const pct = (v: number) => `${Math.round(v * 100)}%`
  return (
    <>
      <Section title={t('studio.overlay')}>
        <Slider label={t('studio.positionX')} value={overlay.x} min={0} max={1} step={0.01} format={pct} onChange={(v) => patch({ x: v })} />
        <Slider label={t('studio.positionY')} value={overlay.y} min={0} max={1} step={0.01} format={pct} onChange={(v) => patch({ y: v })} />
        <Slider label={t('studio.width')} value={overlay.width} min={0.1} max={1} step={0.01} format={pct} onChange={(v) => patch({ width: v })} />
        <Slider label={t('studio.rotation')} value={overlay.rotationDeg} min={-30} max={30} step={1} format={(v) => `${v}°`} onChange={(v) => patch({ rotationDeg: v })} />
        <Slider label={t('studio.opacity')} value={overlay.opacity} min={0.1} max={1} step={0.01} format={pct} onChange={(v) => patch({ opacity: v })} />
        <Slider label={t('studio.corners')} value={overlay.radius} min={0} max={1} step={0.01} format={pct} onChange={(v) => patch({ radius: v })} />
      </Section>
      <Section title={t('editor.text.anim')}>
        <Chips value={overlay.anim} options={MEDIA_ANIMS} label={(v) => t(`editor.anims.${v}`)} onChange={(v) => patch({ anim: v })} />
      </Section>
      <button type="button" className="studio-link text-[var(--danger)]" onClick={() => { edit((pr) => ({ ...pr, overlays: pr.overlays.filter((o) => o.id !== overlay.id) })); select(null) }}>
        {t('editor.text.delete')}
      </button>
    </>
  )
}

// ── Project ────────────────────────────────────────────────────────────────────

function ProjectPanel() {
  const { t } = useTranslation('capture')
  const project = useClipStudioStore((s) => s.project)
  const output = useClipStudioStore((s) => s.output)
  const setPreset = useClipStudioStore((s) => s.setPreset)
  const setOutput = useClipStudioStore((s) => s.setOutput)
  const edit = useClipStudioStore((s) => s.edit)
  const presets = Object.keys(OUTPUT_PRESETS) as OutputPreset[]
  const rhythm = rhythmFor(project)
  const setAudio = (p: Partial<EditProject['audio']>) => edit((pr) => ({ ...pr, audio: { ...pr.audio, ...p } }))
  const fades = ['none', 'black', 'white'] as const
  const fadeLabel = (f: typeof fades[number]) => t(f === 'none' ? 'studio.fadeNone' : f === 'black' ? 'studio.fadeBlack' : 'studio.fadeWhite')

  return (
    <>
      <Section title={t('studio.format')}>
        <Chips value={output.preset} options={presets} label={(v) => t(`studio.platforms.${v}`)} onChange={setPreset} />
        <Chips value={output.fill} options={['crop', 'fit'] as const} label={(v) => t(v === 'crop' ? 'studio.fill' : 'studio.fit')} onChange={(v) => setOutput({ fill: v })} />
        <label className="flex items-center gap-2 text-[var(--text-dim)]">
          <input type="checkbox" checked={output.watermark} onChange={(e) => setOutput({ watermark: e.target.checked })} />
          {t('studio.watermark')}
        </label>
      </Section>

      <Section title={t('studio.music')}>
        <Chips
          value={project.audio.kind === 'builtin' ? (project.audio.trackId ?? 'none') : 'none'}
          options={['none', ...BUILTIN_BED_IDS] as const}
          label={(v) => (v === 'none' ? t('studio.musicNone') : t(`editor.beds.${v as BuiltInBedId}`))}
          onChange={(v) => setAudio(v === 'none' ? { kind: 'none', trackId: null } : { kind: 'builtin', trackId: v })}
        />
        {project.audio.kind !== 'none' && (
          <Slider label={t('studio.volume')} value={project.audio.volume} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setAudio({ volume: v })} />
        )}
        {rhythm && project.clips.length > 1 && (
          <>
            <button type="button" className="studio-btn" onClick={() => edit((pr) => snapCutsToBeats(pr, rhythm))}>
              {t('studio.snapToBeat')}
            </button>
            <p className="text-[11px] leading-relaxed text-[var(--text-faint)]">{t('studio.snapToBeatHint')}</p>
          </>
        )}
      </Section>

      <Section title={t('studio.project')}>
        <span className="text-[11.5px] text-[var(--text-dim)]">{t('studio.intro')}</span>
        <Chips value={project.intro.type} options={fades} label={fadeLabel} onChange={(v) => edit((pr) => ({ ...pr, intro: { ...pr.intro, type: v } }))} />
        <span className="text-[11.5px] text-[var(--text-dim)]">{t('studio.outro')}</span>
        <Chips value={project.outro.type} options={fades} label={fadeLabel} onChange={(v) => edit((pr) => ({ ...pr, outro: { ...pr.outro, type: v } }))} />
      </Section>
    </>
  )
}
