// ─── Editor inspector ──────────────────────────────────────────────────────────
// The right-hand panel: whatever is selected, edited here. Four tabs mirroring
// the order you actually work in — write the titles, set the transitions, pick
// the music, then deliver. Every control is a controlled input driven by the
// capture store; this file holds no edit rules of its own.

import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import * as Icons from '../Icons'
import {
  TEXT_STYLES, TEXT_ANCHORS, TEXT_ANIMS, TRANSITIONS, MAX_TRANSITION_SEC,
  type TextOverlay, type TextStyleId, type TextAnchor, type TextAnimId,
  type TransitionSpec, type TransitionId, type AudioSelection,
} from '../../lib/capture/timeline'
import { BUILTIN_BED_IDS, MAX_AUDIO_FILE_BYTES, type BuiltInBedId } from '../../lib/capture/audio-library'
import { PAD_STYLES, type FrameFit, type PadStyle } from '../../lib/capture/frame-layout'
import { SOCIAL_PRESET_IDS, SOCIAL_PRESETS, type SocialPresetId } from '../../lib/capture/social-presets'
import { GIF_FPS_OPTIONS, GIF_HEIGHT_OPTIONS } from '../../lib/capture/replay-buffer-core'

export type InspectorTab = 'text' | 'effects' | 'audio' | 'export'

export const INSPECTOR_TABS: readonly InspectorTab[] = ['text', 'effects', 'audio', 'export']

/** Text colours offered as one-click swatches (plus a free colour input). */
const SWATCHES = ['#FFFFFF', '#0B0D11', '#4C7EF3', '#2E9E7A', '#F5A623', '#E0534E']

const label = 'text-[10px] font-semibold uppercase tracking-wide text-[var(--text-faint)]'
const row = 'flex flex-col gap-1.5'
const chipBase = 'px-2 h-[24px] rounded-[5px] text-[11px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
const chipOff = 'bg-[var(--surface-2)] text-[var(--text-dim)] hover:text-[var(--text)]'
const chipOn = 'bg-[var(--accent)] text-white'
const inputCls = 'w-full bg-[var(--surface-2)] border border-[var(--border-strong)] rounded-[5px] px-2 py-1.5 text-[12px] text-[var(--text)] outline-none focus:border-[var(--accent)]'
const selectCls = 'bg-[var(--surface-2)] border border-[var(--border-strong)] rounded-[5px] px-2 h-[26px] text-[11px] text-[var(--text)] outline-none'

// ── Tab bar ────────────────────────────────────────────────────────────────────

export function InspectorTabs({ active, onChange }: { active: InspectorTab; onChange: (t: InspectorTab) => void }) {
  const { t } = useTranslation('capture')
  const icons: Record<InspectorTab, JSX.Element> = {
    text: <Icons.TypeTool size={11} />,
    effects: <Icons.Transition size={11} />,
    audio: <Icons.Music size={11} />,
    export: <Icons.Download size={11} />,
  }
  return (
    <div className="flex items-center gap-0.5 p-0.5 rounded-[6px] bg-[var(--surface-2)] border border-[var(--border)]" role="tablist">
      {INSPECTOR_TABS.map((tab) => (
        <button
          key={tab}
          role="tab"
          aria-selected={tab === active}
          onClick={() => onChange(tab)}
          className={`flex-1 inline-flex items-center justify-center gap-1 h-[24px] rounded-[4px] text-[11px] font-medium transition-colors ${
            tab === active ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm' : 'text-[var(--text-dim)] hover:text-[var(--text)]'
          }`}
        >
          {icons[tab]}
          <span className="hidden sm:inline">{t(`editor.tabs.${tab}`)}</span>
        </button>
      ))}
    </div>
  )
}

// ── Text ───────────────────────────────────────────────────────────────────────

export interface TextPanelProps {
  card: TextOverlay | null
  disabled: boolean
  playhead: number
  onAdd: () => void
  onChange: (patch: Partial<TextOverlay>) => void
  onDelete: () => void
  onMoveToPlayhead: () => void
}

export function TextPanel({ card, disabled, playhead, onAdd, onChange, onDelete, onMoveToPlayhead }: TextPanelProps) {
  const { t } = useTranslation('capture')

  if (!card) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
        <Icons.TypeTool size={20} className="text-[var(--text-faint)]" />
        <p className="text-[11px] text-[var(--text-dim)] max-w-[190px]">{t('editor.text.empty')}</p>
        <button onClick={onAdd} disabled={disabled} className={`${chipBase} ${chipOn} inline-flex items-center gap-1`}>
          <Icons.Plus size={11} /> {t('editor.text.add')}
        </button>
        <span className="text-[10px] text-[var(--text-faint)]">
          {t('editor.text.addAt', { time: playhead.toFixed(1) })}
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className={row}>
        <span className={label}>{t('editor.text.content')}</span>
        <textarea
          value={card.text}
          disabled={disabled}
          rows={2}
          placeholder={t('editor.text.placeholder')}
          onChange={(e) => onChange({ text: e.target.value })}
          className={`${inputCls} resize-none`}
        />
      </div>

      <div className={row}>
        <span className={label}>{t('editor.text.style')}</span>
        <div className="flex flex-wrap gap-1">
          {TEXT_STYLES.map((s: TextStyleId) => (
            <button key={s} disabled={disabled} onClick={() => onChange({ style: s })}
              className={`${chipBase} ${s === card.style ? chipOn : chipOff}`}>
              {t(`editor.styles.${s}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <div className={row}>
          <span className={label}>{t('editor.text.anchor')}</span>
          {/* 3×3 placement grid — the fastest way to say "top left". */}
          <div className="grid grid-cols-3 gap-[3px] w-[66px]">
            {TEXT_ANCHORS.map((a: TextAnchor) => (
              <button
                key={a}
                disabled={disabled}
                aria-label={a}
                title={a}
                onClick={() => onChange({ anchor: a })}
                className={`h-[20px] rounded-[3px] transition-colors ${
                  a === card.anchor ? 'bg-[var(--accent)]' : 'bg-[var(--surface-2)] hover:bg-[var(--border-strong)]'
                }`}
              />
            ))}
          </div>
        </div>

        <div className={`${row} flex-1`}>
          <span className={label}>{t('editor.text.color')}</span>
          <div className="flex flex-wrap items-center gap-1">
            {SWATCHES.map((c) => (
              <button
                key={c}
                disabled={disabled}
                aria-label={c}
                onClick={() => onChange({ color: c })}
                style={{ background: c }}
                className={`w-[20px] h-[20px] rounded-[4px] border transition-transform ${
                  card.color.toUpperCase() === c ? 'border-[var(--accent)] scale-110' : 'border-[var(--border-strong)]'
                }`}
              />
            ))}
            <input
              type="color"
              value={card.color}
              disabled={disabled}
              onChange={(e) => onChange({ color: e.target.value })}
              aria-label={t('editor.text.color')}
              className="w-[20px] h-[20px] rounded-[4px] bg-transparent border border-[var(--border-strong)] cursor-pointer"
            />
          </div>
        </div>
      </div>

      <div className={row}>
        <span className={label}>{t('editor.text.anim')}</span>
        <div className="flex flex-wrap gap-1">
          {TEXT_ANIMS.map((a: TextAnimId) => (
            <button key={a} disabled={disabled} onClick={() => onChange({ anim: a })}
              className={`${chipBase} ${a === card.anim ? chipOn : chipOff}`}>
              {t(`editor.anims.${a}`)}
            </button>
          ))}
        </div>
      </div>

      <div className={row}>
        <span className={label}>{t('editor.text.size')}</span>
        <div className="flex items-center gap-2">
          <input
            type="range" min={0.5} max={2} step={0.05} value={card.scale} disabled={disabled}
            onChange={(e) => onChange({ scale: parseFloat(e.target.value) })}
            className="flex-1 accent-[var(--accent)]"
            aria-label={t('editor.text.size')}
          />
          <span className="text-[10px] font-mono tabular-nums text-[var(--text-faint)] w-[34px] text-right">
            {Math.round(card.scale * 100)}%
          </span>
        </div>
      </div>

      <div className={row}>
        <span className={label}>{t('editor.text.timing')}</span>
        <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-[var(--text-dim)]">
          <span>{card.startSec.toFixed(1)}s → {card.endSec.toFixed(1)}s</span>
          <span>{(card.endSec - card.startSec).toFixed(1)}s</span>
        </div>
        <button onClick={onMoveToPlayhead} disabled={disabled} className={`${chipBase} ${chipOff} w-full`}>
          {t('editor.text.atPlayhead')}
        </button>
      </div>

      <div className="flex items-center gap-1 pt-1 border-t border-[var(--border)]">
        <button onClick={onAdd} disabled={disabled} className={`${chipBase} ${chipOff} flex-1 inline-flex items-center justify-center gap-1`}>
          <Icons.Plus size={11} /> {t('editor.text.add')}
        </button>
        <button
          onClick={onDelete}
          disabled={disabled}
          className={`${chipBase} bg-[var(--surface-2)] text-[#E0534E] hover:bg-[#E0534E] hover:text-white inline-flex items-center gap-1`}
        >
          <Icons.Trash size={11} /> {t('editor.text.delete')}
        </button>
      </div>
    </div>
  )
}

// ── Effects (transitions) ──────────────────────────────────────────────────────

export interface EffectsPanelProps {
  transition: TransitionSpec
  disabled: boolean
  onChange: (patch: Partial<TransitionSpec>) => void
}

export function EffectsPanel({ transition, disabled, onChange }: EffectsPanelProps) {
  const { t } = useTranslation('capture')

  const edge = (
    which: 'in' | 'out',
    type: TransitionId,
    seconds: number,
  ) => (
    <div className={row} key={which}>
      <span className={label}>{t(`editor.effects.${which}`)}</span>
      <div className="flex flex-wrap gap-1">
        {TRANSITIONS.map((id) => (
          <button
            key={id}
            disabled={disabled}
            onClick={() => onChange(which === 'in' ? { inType: id } : { outType: id })}
            className={`${chipBase} ${id === type ? chipOn : chipOff}`}
          >
            {t(`editor.transitions.${id}`)}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range" min={0.1} max={MAX_TRANSITION_SEC} step={0.1} value={seconds}
          disabled={disabled || type === 'none'}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            onChange(which === 'in' ? { inSec: v } : { outSec: v })
          }}
          className="flex-1 accent-[var(--accent)] disabled:opacity-40"
          aria-label={t('editor.effects.duration')}
        />
        <span className="text-[10px] font-mono tabular-nums text-[var(--text-faint)] w-[30px] text-right">
          {seconds.toFixed(1)}s
        </span>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-3">
      {edge('in', transition.inType, transition.inSec)}
      {edge('out', transition.outType, transition.outSec)}
      <p className="text-[10px] leading-relaxed text-[var(--text-faint)]">{t('editor.effects.hint')}</p>
    </div>
  )
}

// ── Audio ──────────────────────────────────────────────────────────────────────

export interface AudioPanelProps {
  audio: AudioSelection
  disabled: boolean
  /** Set while a bed is being synthesised or a file decoded. */
  loading: boolean
  error: string | null
  onPickBed: (id: BuiltInBedId) => void
  onPickFile: (file: File) => void
  onClear: () => void
  onChange: (patch: Partial<AudioSelection>) => void
}

export function AudioPanel({ audio, disabled, loading, error, onPickBed, onPickFile, onClear, onChange }: AudioPanelProps) {
  const { t } = useTranslation('capture')
  const fileRef = useRef<HTMLInputElement | null>(null)

  return (
    <div className="flex flex-col gap-3">
      <div className={row}>
        <span className={label}>{t('editor.audio.builtin')}</span>
        <div className="flex flex-wrap gap-1">
          {BUILTIN_BED_IDS.map((id) => (
            <button
              key={id}
              disabled={disabled || loading}
              onClick={() => onPickBed(id)}
              className={`${chipBase} ${audio.kind === 'builtin' && audio.trackId === id ? chipOn : chipOff}`}
            >
              {t(`editor.beds.${id}`)}
            </button>
          ))}
        </div>
        <p className="text-[10px] leading-relaxed text-[var(--text-faint)]">{t('editor.audio.synthNote')}</p>
      </div>

      <div className={row}>
        <span className={label}>{t('editor.audio.upload')}</span>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onPickFile(file)
            // Reset so re-picking the same file fires change again.
            e.target.value = ''
          }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={disabled || loading}
          className={`${chipBase} ${audio.kind === 'user' ? chipOn : chipOff} w-full inline-flex items-center justify-center gap-1`}
        >
          <Icons.Upload size={11} />
          <span className="truncate">{audio.kind === 'user' && audio.fileName ? audio.fileName : t('editor.audio.chooseFile')}</span>
        </button>
        <p className="text-[10px] leading-relaxed text-[var(--text-faint)]">
          {t('editor.audio.uploadHint', { max: Math.round(MAX_AUDIO_FILE_BYTES / (1024 * 1024)) })}
        </p>
      </div>

      {loading && <p className="text-[11px] text-[var(--text-dim)]">{t('editor.audio.loading')}</p>}
      {error && <p className="text-[11px] text-[#E0534E]">{error}</p>}

      {audio.kind !== 'none' && (
        <>
          <div className={row}>
            <span className={label}>{t('editor.audio.volume')}</span>
            <div className="flex items-center gap-2">
              <input
                type="range" min={0} max={1} step={0.05} value={audio.volume} disabled={disabled}
                onChange={(e) => onChange({ volume: parseFloat(e.target.value) })}
                className="flex-1 accent-[var(--accent)]"
                aria-label={t('editor.audio.volume')}
              />
              <span className="text-[10px] font-mono tabular-nums text-[var(--text-faint)] w-[34px] text-right">
                {Math.round(audio.volume * 100)}%
              </span>
            </div>
          </div>

          <div className={row}>
            <span className={label}>{t('editor.audio.fade')}</span>
            <div className="flex items-center gap-2">
              <input
                type="range" min={0} max={3} step={0.1} value={audio.fadeSec} disabled={disabled}
                onChange={(e) => onChange({ fadeSec: parseFloat(e.target.value) })}
                className="flex-1 accent-[var(--accent)]"
                aria-label={t('editor.audio.fade')}
              />
              <span className="text-[10px] font-mono tabular-nums text-[var(--text-faint)] w-[34px] text-right">
                {audio.fadeSec.toFixed(1)}s
              </span>
            </div>
          </div>

          <div className={row}>
            <span className={label}>{t('editor.audio.offset')}</span>
            <div className="flex items-center gap-2">
              <input
                type="range" min={0} max={20} step={0.5} value={audio.offsetSec} disabled={disabled}
                onChange={(e) => onChange({ offsetSec: parseFloat(e.target.value) })}
                className="flex-1 accent-[var(--accent)]"
                aria-label={t('editor.audio.offset')}
              />
              <span className="text-[10px] font-mono tabular-nums text-[var(--text-faint)] w-[34px] text-right">
                {audio.offsetSec.toFixed(1)}s
              </span>
            </div>
          </div>

          <button onClick={onClear} disabled={disabled} className={`${chipBase} ${chipOff} w-full`}>
            {t('editor.audio.remove')}
          </button>
        </>
      )}

      <p className="text-[10px] leading-relaxed text-[var(--text-faint)]">{t('editor.audio.gifNote')}</p>
    </div>
  )
}

// ── Export ─────────────────────────────────────────────────────────────────────

export interface ExportPanelProps {
  disabled: boolean
  presetId: SocialPresetId | null
  fit: FrameFit
  padStyle: PadStyle
  padded: boolean
  fps: number
  height: number | null
  watermark: boolean
  /** Container the browser will actually record, e.g. 'mp4'. */
  container: 'mp4' | 'webm' | null
  onPreset: (id: SocialPresetId) => void
  onFit: (fit: FrameFit) => void
  onPadStyle: (p: PadStyle) => void
  onFps: (fps: number) => void
  onHeight: (h: number | null) => void
  onWatermark: (v: boolean) => void
}

export function ExportPanel(props: ExportPanelProps) {
  const { t } = useTranslation('capture')
  const {
    disabled, presetId, fit, padStyle, padded, fps, height, watermark, container,
    onPreset, onFit, onPadStyle, onFps, onHeight, onWatermark,
  } = props

  return (
    <div className="flex flex-col gap-3">
      <div className={row}>
        <span className={label}>{t('editor.export.preset')}</span>
        <div className="flex flex-wrap gap-1">
          {SOCIAL_PRESET_IDS.map((id) => (
            <button
              key={id}
              disabled={disabled}
              onClick={() => onPreset(id)}
              className={`${chipBase} ${id === presetId ? chipOn : chipOff} inline-flex items-center gap-1`}
            >
              {t(`editor.presets.${id}`)}
              {SOCIAL_PRESETS[id].ratioLabel && (
                <span className="opacity-60 font-mono text-[9px]">{SOCIAL_PRESETS[id].ratioLabel}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className={row}>
        <span className={label}>{t('editor.export.framing')}</span>
        <div className="flex gap-1">
          <button disabled={disabled} onClick={() => onFit('fit')} className={`${chipBase} ${fit === 'fit' ? chipOn : chipOff} flex-1`}>
            {t('editor.export.fitMode')}
          </button>
          <button disabled={disabled} onClick={() => onFit('crop')} className={`${chipBase} ${fit === 'crop' ? chipOn : chipOff} flex-1`}>
            {t('editor.export.fillMode')}
          </button>
        </div>
        <p className="text-[10px] leading-relaxed text-[var(--text-faint)]">
          {fit === 'fit' ? t('editor.export.fitHint') : t('editor.export.fillHint')}
        </p>
      </div>

      {padded && (
        <div className={row}>
          <span className={label}>{t('editor.export.pad')}</span>
          <div className="flex gap-1">
            {PAD_STYLES.map((p) => (
              <button key={p} disabled={disabled} onClick={() => onPadStyle(p)}
                className={`${chipBase} ${p === padStyle ? chipOn : chipOff} flex-1`}>
                {t(`editor.export.pad_${p}`)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5">
          <span className={label}>{t('resolutionLabel')}</span>
          <select
            value={height ?? 'source'} disabled={disabled}
            onChange={(e) => onHeight(e.target.value === 'source' ? null : parseInt(e.target.value, 10))}
            className={selectCls}
          >
            {GIF_HEIGHT_OPTIONS.map((h) => <option key={h} value={h}>{h}p</option>)}
            <option value="source">{t('sourceRes')}</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <span className={label}>{t('fpsLabel')}</span>
          <select
            value={fps} disabled={disabled}
            onChange={(e) => onFps(parseInt(e.target.value, 10))}
            className={selectCls}
          >
            {GIF_FPS_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
      </div>

      <label className="flex items-center gap-1.5 cursor-pointer">
        <input
          type="checkbox" checked={watermark} disabled={disabled}
          onChange={(e) => onWatermark(e.target.checked)}
          className="accent-[var(--accent)]"
        />
        <span className="text-[11px] text-[var(--text-dim)]">{t('watermarkLabel')}</span>
      </label>

      <p className="text-[10px] leading-relaxed text-[var(--text-faint)] pt-1 border-t border-[var(--border)]">
        {container === 'mp4' ? t('editor.export.mp4Note')
          : container === 'webm' ? t('editor.export.webmNote')
            : t('editor.export.noVideoNote')}
      </p>
    </div>
  )
}
