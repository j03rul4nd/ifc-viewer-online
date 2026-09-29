// ─── Clip Studio inspector ─────────────────────────────────────────────────────
// Edits whatever is selected on the timeline; with nothing selected it shows
// the project: format, music, fades, cut-on-the-beat.

import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useClipStudioStore, OUTPUT_PRESETS, type OutputPreset } from '../../stores/clipStudioStore'
import { toast } from '../../stores/toastStore'
import {
  CLIP_TRANSITIONS, MAX_SPEED, MAX_TRANSITION_SEC, MIN_SPEED, setAllTransitions, snapCutsToBeats, updateClip,
  type Clip, type ClipTransition, type EditProject, type Framing, type MediaOverlay,
} from '../../lib/capture/project'
import {
  createTextOverlay, MEDIA_ANIMS, SOUND_RIGHTS, TEXT_ANCHORS, TEXT_ANIMS, TEXT_STYLES, type SoundRights, type TextOverlay,
} from '../../lib/capture/timeline'
import { BUILTIN_BED_IDS, type BuiltInBedId } from '../../lib/capture/audio-library'
import { currentModelFacts, importSound, rhythmFor } from '../../lib/capture/studio-actions'
import { applyTemplate, TEMPLATE_IDS, templateMinClips, type TemplateId } from '../../lib/capture/viral-templates'
import { hookEndSec, metaFromTaps, syncProjectToMusic } from '../../lib/capture/music-analysis'
import { canCapture, startCapture, type CaptureSource, type Recording } from '../../lib/capture/sound-capture'
import { enrichTikTokLink, formatStart, parseTikTokUrl, trendingSoundsUrl, type SoundLink } from '../../lib/capture/tiktok-link'
import { LOOK_IDS, LOOKS, restyleProject } from '../../lib/director/looks'

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
    case 'glitch': return <svg {...common}><path d="M1 3h8M5 6h12M2 9h9" stroke="currentColor" strokeWidth="1.5" /><path d="M9 3h3M11 9h3" stroke="#FF2B5E" strokeWidth="1.5" /></svg>
    case 'iris': return <svg {...common}><rect x="1" y="1" width="16" height="10" rx="1" stroke="currentColor" fill="none" opacity=".5" /><circle cx="9" cy="6" r="3.2" fill="currentColor" /></svg>
    case 'squeeze': return <svg {...common}><path d="M1 6h16" stroke="currentColor" strokeWidth="2" /><path d="M9 1v3M7.5 2.5 9 4l1.5-1.5M9 11V8M7.5 9.5 9 8l1.5 1.5" stroke="currentColor" fill="none" /></svg>
    case 'spin': return <svg {...common}><path d="M13.5 3.5A5 5 0 1 0 14 8" stroke="currentColor" fill="none" strokeWidth="1.5" /><path d="M14 1v3h-3" stroke="currentColor" fill="none" strokeWidth="1.5" /></svg>
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

      <Section title={t('studio.director.lookLabel')}>
        <div className="grid grid-cols-2 gap-1.5">
          {LOOK_IDS.map((id) => {
            const lk = LOOKS[id]
            const swatch = [lk.background?.top ?? '#0a0a0c', lk.palette?.envelope ?? '#9aa0ae', lk.palette?.glazing ?? '#6b7a90', lk.accent]
            return (
              <button key={id} type="button" className="studio-look" aria-pressed={(project.lookId ?? 'native') === id} onClick={() => edit((p) => restyleProject(p, id))}>
                <span className="studio-look-swatch" aria-hidden="true">{swatch.map((c, i) => <span key={i} style={{ background: c }} />)}</span>
                <span className="studio-look-name">{t(`studio.director.looks2.${id}`)}</span>
              </button>
            )
          })}
        </div>
        <p className="text-[11px] leading-relaxed text-[var(--text-faint)]">{t('studio.restyleHint')}</p>
      </Section>

      <Section title={t('studio.music')}>
        <Chips
          value={project.audio.kind === 'builtin' ? (project.audio.trackId ?? 'none') : 'none'}
          options={['none', ...BUILTIN_BED_IDS] as const}
          label={(v) => (v === 'none' ? t('studio.musicNone') : t(`editor.beds.${v as BuiltInBedId}`))}
          onChange={(v) => setAudio(v === 'none' ? { kind: 'none', trackId: null } : { kind: 'builtin', trackId: v })}
        />
        <TikTokSound />
        <ViralSound />
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

      {project.sfx && project.sfx.cues.length > 0 && (
        <Section title={t('studio.sfxTitle')}>
          <span className="text-[11.5px] text-[var(--text-dim)]">{t('studio.sfxCount', { n: project.sfx.cues.length })}</span>
          <Slider label={t('studio.sfxVolume')} value={project.sfx.volume} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => edit((pr) => (pr.sfx ? { ...pr, sfx: { ...pr.sfx, volume: v } } : pr))} />
          <button type="button" className="studio-link" onClick={() => edit((pr) => ({ ...pr, sfx: undefined }))}>{t('studio.sfxRemove')}</button>
        </Section>
      )}

      <Section title={t('studio.hudTitle')}>
        <label className="flex items-center gap-2 text-[11.5px] text-[var(--text-dim)]">
          <input
            type="checkbox"
            checked={!!project.fx?.hud}
            onChange={(e) => {
              const on = e.target.checked
              edit((pr) => ({ ...pr, fx: { ...pr.fx, hud: on ? { label: pr.sources[0]?.label ?? 'IFC', accent: '#FF4F1F' } : undefined } }))
            }}
          />
          {t('studio.hudOn')}
        </label>
      </Section>

      <ViralTemplates />

      <Section title={t('studio.project')}>
        <span className="text-[11.5px] text-[var(--text-dim)]">{t('studio.intro')}</span>
        <Chips value={project.intro.type} options={fades} label={fadeLabel} onChange={(v) => edit((pr) => ({ ...pr, intro: { ...pr.intro, type: v } }))} />
        <span className="text-[11.5px] text-[var(--text-dim)]">{t('studio.outro')}</span>
        <Chips value={project.outro.type} options={fades} label={fadeLabel} onChange={(v) => edit((pr) => ({ ...pr, outro: { ...pr.outro, type: v } }))} />
      </Section>
    </>
  )
}

// ── Viral sound ────────────────────────────────────────────────────────────────
// The user's own track or a trending sound saved from TikTok/Reels/Shorts
// (audio file, or the video itself — we take its soundtrack). Analysed
// locally for tempo and drop, then the edit is cut to it.

function ViralSound() {
  const { t } = useTranslation('capture')
  const audio = useClipStudioStore((s) => s.project.audio)
  const hasClips = useClipStudioStore((s) => s.project.clips.length > 0)
  const hasSound = useClipStudioStore((s) => !!s.sound)
  const busy = useClipStudioStore((s) => !!s.job)
  const edit = useClipStudioStore((s) => s.edit)
  const fileRef = useRef<HTMLInputElement>(null)
  const music = audio.kind === 'user' ? audio.music : undefined

  const onFile = async (file: File | undefined) => {
    if (!file) return
    try {
      await importSound(file, t('studio.sound.analysing'))
      toast(t('studio.sound.ready'), 'success')
    } catch (e) {
      toast(t('studio.sound.failed', { reason: e instanceof Error ? e.message : String(e) }), 'error')
    }
  }

  const addHook = () => edit((p) => {
    const end = hookEndSec(p)
    const hook = createTextOverlay({ text: t('studio.sound.hookText'), startSec: 0, endSec: end, style: 'title', anim: 'pop', anchor: 'top-center' }, Math.max(end, 0.5))
    return { ...p, texts: [...p.texts, hook] }
  })

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[var(--border)] p-2.5">
      <span className="text-[11.5px] font-semibold">{t('studio.sound.title')}</span>
      <button type="button" className="studio-btn" disabled={busy} onClick={() => fileRef.current?.click()}>
        ♪ {audio.kind === 'user' && hasSound ? t('studio.sound.replace') : t('studio.sound.import')}
      </button>
      <input ref={fileRef} type="file" accept="audio/*,video/mp4,video/quicktime,video/webm" hidden onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = '' }} />
      <p className="text-[11px] leading-relaxed text-[var(--text-faint)]">{t('studio.sound.importHint')}</p>

      {audio.kind === 'user' && !hasSound && (
        <p className="text-[11px] text-[var(--warn)]">{t('studio.sound.missing', { name: audio.fileName ?? '' })}</p>
      )}

      {music && hasSound && (
        <>
          <span className="font-mono text-[11px] text-[var(--text-dim)]">
            {audio.fileName} · {Math.round(music.bpm)} BPM · {t('studio.sound.drop', { sec: music.dropSec.toFixed(1) })}
          </span>
          <span className="text-[11.5px] text-[var(--text-dim)]">{t('studio.sound.rights')}</span>
          <Chips
            value={audio.rights ?? 'viral'}
            options={SOUND_RIGHTS}
            label={(v) => t(`studio.sound.rightsOpt.${v}`)}
            onChange={(v: SoundRights) => edit((p) => ({ ...p, audio: { ...p.audio, rights: v } }))}
          />
          <button type="button" className="studio-btn studio-btn--accent" disabled={!hasClips} onClick={() => edit((p) => syncProjectToMusic(p, music))}>
            {t('studio.sound.sync')}
          </button>
          <p className="text-[11px] leading-relaxed text-[var(--text-faint)]">{t('studio.sound.syncHint')}</p>
          <button type="button" className="studio-btn" disabled={!hasClips} onClick={addHook}>{t('studio.sound.addHook')}</button>
          <p className="text-[11px] leading-relaxed text-[var(--text-faint)]">{t('studio.sound.hookHint')}</p>
        </>
      )}
    </div>
  )
}

// ── TikTok sound (by link) ─────────────────────────────────────────────────────
// Cut the edit for a sound that stays in TikTok: paste its link, tap along
// while it plays on the phone, mark the drop. We export the picture timed to
// it and say where to start the sound in the app — free, and the best reach.

function TikTokSound() {
  const { t } = useTranslation('capture')
  const audio = useClipStudioStore((s) => s.project.audio)
  const hasClips = useClipStudioStore((s) => s.project.clips.length > 0)
  const hasSound = useClipStudioStore((s) => !!s.sound)
  const edit = useClipStudioStore((s) => s.edit)
  const [url, setUrl] = useState(audio.link?.url ?? '')
  const [link, setLink] = useState<SoundLink | null>(audio.link ?? null)
  const [tapping, setTapping] = useState<{ t0: number; taps: number[]; drop: number | null } | null>(null)
  const inApp = !!audio.link && !!audio.music && !(audio.kind === 'user' && hasSound)
  const busy = useClipStudioStore((s) => !!s.job)
  const [recording, setRecording] = useState<{ source: CaptureSource; rec: Recording } | null>(null)

  // Listen to the sound while it plays (a TikTok tab, or the phone's speaker).
  const record = async (source: CaptureSource) => {
    if (!link) return
    let rec: Recording
    try {
      rec = await startCapture(source)
    } catch (e) {
      const code = e instanceof Error ? e.message : ''
      if (code === 'NO_AUDIO') toast(t('studio.tiktok.noTabAudio'), 'warning')
      else if (!(e instanceof DOMException && e.name === 'NotAllowedError')) toast(t('studio.sound.failed', { reason: code }), 'error')
      return
    }
    setRecording({ source, rec })
    try {
      const blob = await rec.done
      await importSound(blob, t('studio.sound.analysing'), {
        name: link.title ?? t('studio.tiktok.untitled'), trimLeadingSilence: true, timingOnly: source === 'mic', link,
      })
      toast(t('studio.sound.ready'), 'success')
    } catch (e) {
      toast(t('studio.sound.failed', { reason: e instanceof Error ? e.message : String(e) }), 'error')
    } finally {
      setRecording(null)
    }
  }

  const onUrl = async (v: string) => {
    setUrl(v)
    const parsed = parseTikTokUrl(v)
    setLink(parsed)
    latest.current = v
    if (!parsed) return
    const rich = await enrichTikTokLink(parsed)
    if (latest.current === v) setLink(rich) // a newer paste wins
  }
  const latest = useRef('')

  const now = () => (performance.now() - (tapping?.t0 ?? 0)) / 1000
  const meta = tapping ? metaFromTaps(tapping.taps, tapping.drop) : null

  const apply = () => {
    if (!meta || !link) return
    edit((p) => {
      // The sound lives in TikTok: keep the file silent unless the user also imported it.
      const next: EditProject = { ...p, audio: { ...p.audio, kind: p.audio.kind === 'builtin' ? 'none' : p.audio.kind, music: meta, link } }
      return next.clips.length > 0 ? syncProjectToMusic(next, meta) : next
    })
    setTapping(null)
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[var(--border)] p-2.5">
      <span className="text-[11.5px] font-semibold">{t('studio.tiktok.title')}</span>
      <a className="studio-btn justify-center" href={trendingSoundsUrl(navigator.language.split('-')[1] ?? 'ES')} target="_blank" rel="noopener noreferrer">
        🔥 {t('studio.tiktok.trending')}
      </a>
      <input className="studio-input" type="url" inputMode="url" placeholder={t('studio.tiktok.placeholder')} value={url} onChange={(e) => { void onUrl(e.target.value) }} />
      {url && !link && <p className="text-[11px] text-[var(--warn)]">{t('studio.tiktok.invalid')}</p>}
      {link && (
        <div className="flex items-center gap-2">
          {link.cover && <img src={link.cover} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />}
          <div className="min-w-0 flex-1 text-[11.5px]">
            <div className="truncate font-medium">{link.title ?? t('studio.tiktok.untitled')}</div>
            {link.author && <div className="truncate text-[var(--text-faint)]">@{link.author}</div>}
          </div>
          <a className="studio-link shrink-0" href={link.url} target="_blank" rel="noopener noreferrer">{t('studio.tiktok.open')}</a>
        </div>
      )}

      {link && !tapping && !recording && (
        <>
          {canCapture('tab') && (
            <button type="button" className="studio-btn studio-btn--accent" disabled={busy} onClick={() => void record('tab')}>
              🎧 {t('studio.tiktok.captureTab')}
            </button>
          )}
          {canCapture('mic') && (
            <button type="button" className="studio-btn" disabled={busy} onClick={() => void record('mic')}>
              🎤 {t('studio.tiktok.captureMic')}
            </button>
          )}
          <p className="text-[11px] leading-relaxed text-[var(--text-faint)]">{t('studio.tiktok.captureHint')}</p>
        </>
      )}
      {recording && (
        <div className="flex flex-col gap-1.5 rounded bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] p-2">
          <span className="text-[11.5px] font-medium">● {t(recording.source === 'tab' ? 'studio.tiktok.recordingTab' : 'studio.tiktok.recordingMic')}</span>
          <button type="button" className="studio-btn studio-btn--accent" onClick={() => recording.rec.stop()}>{t('studio.tiktok.stopRecording')}</button>
        </div>
      )}
      {link && !tapping && !recording && (
        <>
          <button type="button" className="studio-btn" onClick={() => setTapping({ t0: performance.now(), taps: [], drop: null })}>
            ⏱ {t('studio.tiktok.tapStart')}
          </button>
          <p className="text-[11px] leading-relaxed text-[var(--text-faint)]">{t('studio.tiktok.tapHint')}</p>
        </>
      )}
      {tapping && (
        <>
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" className="studio-btn studio-btn--accent h-14 justify-center text-[15px]" onPointerDown={() => setTapping((s) => s && { ...s, taps: [...s.taps, now()] })}>
              {t('studio.tiktok.tap')} ({tapping.taps.length})
            </button>
            <button type="button" className="studio-btn h-14 justify-center text-[15px]" aria-pressed={tapping.drop !== null} onPointerDown={() => setTapping((s) => s && { ...s, drop: now() })}>
              💥 {t('studio.tiktok.drop')}
            </button>
          </div>
          <span className="font-mono text-[11px] text-[var(--text-dim)]">
            {meta ? `${Math.round(meta.bpm)} BPM` : t('studio.tiktok.keepTapping')}
            {tapping.drop !== null && ` · ${t('studio.sound.drop', { sec: tapping.drop.toFixed(1) })}`}
          </span>
          <div className="flex gap-1.5">
            <button type="button" className="studio-btn flex-1" onClick={() => setTapping(null)}>{t('studio.cancel')}</button>
            <button type="button" className="studio-btn studio-btn--accent flex-1" disabled={!meta || tapping.drop === null} onClick={apply}>
              {hasClips ? t('studio.tiktok.apply') : t('studio.tiktok.save')}
            </button>
          </div>
        </>
      )}

      {inApp && audio.music && (
        <p className="rounded bg-[color-mix(in_srgb,var(--ok)_14%,transparent)] p-2 text-[11.5px] leading-relaxed">
          {t('studio.tiktok.howTo', { start: formatStart(audio.offsetSec), bpm: Math.round(audio.music.bpm) })}
        </p>
      )}
    </div>
  )
}

// ── Viral templates ────────────────────────────────────────────────────────────

function ViralTemplates() {
  const { t } = useTranslation('capture')
  const project = useClipStudioStore((s) => s.project)
  const edit = useClipStudioStore((s) => s.edit)

  const apply = (id: TemplateId) => {
    const f = currentModelFacts()
    const facts = [
      f.storeyCount ? t('studio.templates.fact.storeys', { n: f.storeyCount }) : null,
      f.elementCount ? t('studio.templates.fact.elements', { n: f.elementCount.toLocaleString() }) : null,
      typeof f.healthScore === 'number' ? t('studio.templates.fact.health', { n: Math.round(f.healthScore) }) : null,
      f.schema ? t('studio.templates.fact.schema', { schema: f.schema }) : null,
    ].filter((x): x is string => !!x)
    const m = project.audio.music
    edit((p) => applyTemplate(p, id, {
      rhythm: rhythmFor(p),
      dropAt: m ? m.dropSec - p.audio.offsetSec : null,
      labels: {
        waitForIt: t('studio.templates.copy.waitForIt'),
        before: t('studio.templates.copy.before'),
        after: t('studio.templates.copy.after'),
        pov: t('studio.templates.copy.pov'),
        facts,
        factsTitle: t('studio.templates.copy.factsTitle', { n: facts.length }),
      },
    }))
  }

  return (
    <Section title={t('studio.templates.title')}>
      <div className="grid grid-cols-1 gap-1.5">
        {TEMPLATE_IDS.map((id) => (
          <button key={id} type="button" className="studio-btn flex-col items-start text-left" disabled={project.clips.length < templateMinClips(id)} onClick={() => apply(id)}>
            <span className="font-medium">{t(`studio.templates.${id}.name`)}</span>
            <span className="text-[11px] font-normal text-[var(--text-faint)]">{t(`studio.templates.${id}.hint`)}</span>
          </button>
        ))}
      </div>
      <p className="text-[11px] leading-relaxed text-[var(--text-faint)]">{t('studio.templates.undoHint')}</p>
    </Section>
  )
}
