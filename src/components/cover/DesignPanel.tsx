// ─── Design tab: format, colour, type, texture, finish, saved styles ──────────

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as Icons from '../Icons'
import { COVER_FORMATS, COVER_FORMAT_IDS } from '../../lib/cover/formats'
import { COVER_PALETTES } from '../../lib/cover/palettes'
import { TEXTURES, TYPE_SETS } from '../../lib/cover/design'
import { GRADE_PRESETS, GRADE_PRESET_IDS, NEUTRAL_GRADE, presetOf, type Grade } from '../../lib/cover/grade'
import { derivePalette, isHex } from '../../lib/cover/color'
import type { CoverPalette } from '../../lib/cover/types'
import type { History } from './useHistory'
import type { SavedStyle, StudioDoc } from './doc'
import { Section, Slider, Toggle, chip, cls } from './ui'

interface Props {
  doc: StudioDoc
  update: History<StudioDoc>['update']
  /** Palettes sampled from the hero (light / dark), for the "from image" swatches. */
  imagePalettes: { light: CoverPalette; dark: CoverPalette } | null
  score: number | null
  styles: SavedStyle[]
  onSaveStyle: (name: string) => void
  onApplyStyle: (s: SavedStyle) => void
  onDeleteStyle: (id: string) => void
}

const ADJUST: Array<{ key: keyof Grade; min: number; max: number }> = [
  { key: 'exposure', min: -1, max: 1 },
  { key: 'contrast', min: -1, max: 1 },
  { key: 'saturation', min: -1, max: 1 },
  { key: 'warmth', min: -1, max: 1 },
  { key: 'fade', min: 0, max: 1 },
  { key: 'vignette', min: 0, max: 1 },
  { key: 'grain', min: 0, max: 1 },
]

function Swatch({ p, on, title, onClick, badge }: { p: Pick<CoverPalette, 'bg' | 'fg' | 'accent'>; on: boolean; title: string; onClick: () => void; badge?: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title} aria-label={title} aria-pressed={on}
      className={`relative w-8 h-8 rounded-full border-2 overflow-hidden shrink-0 ${on ? 'border-[var(--accent)]' : 'border-[var(--border)]'}`}
      style={{ background: `linear-gradient(135deg, ${p.bg} 0 50%, ${p.accent} 50% 75%, ${p.fg} 75%)` }}>
      {badge && <span className="absolute inset-0 flex items-center justify-center text-white drop-shadow">{badge}</span>}
    </button>
  )
}

export default function DesignPanel({ doc, update, imagePalettes, score, styles, onSaveStyle, onApplyStyle, onDeleteStyle }: Props) {
  const { t } = useTranslation('capture')
  const [fine, setFine] = useState(false)
  const [styleName, setStyleName] = useState('')
  const d = doc.design
  const setDesign = (patch: Partial<StudioDoc['design']>, coalesce?: string) => update((s) => ({ ...s, design: { ...s.design, ...patch } }), coalesce)
  const setGrade = (patch: Partial<Grade>, coalesce?: string) => setDesign({ grade: { ...d.grade, ...patch } }, coalesce)
  const preset = presetOf(d.grade)
  const custom = derivePalette(doc.custom)

  return (
    <div className="space-y-5">
      <Section title={t('cover.format')}>
        {(['print', 'social'] as const).map((g) => (
          <div key={g} className="mb-2">
            <div className={cls.sub}>{t(`cover.fmtGroup.${g}`)}</div>
            <div className="flex flex-wrap gap-1.5">
              {COVER_FORMAT_IDS.filter((id) => COVER_FORMATS[id].group === g).map((id) => (
                <button key={id} onClick={() => update((s) => ({ ...s, format: id }))} className={chip(doc.format === id)}>
                  {t(`cover.fmt.${id}`)}{!t(`cover.fmt.${id}`).includes(COVER_FORMATS[id].ratio) && <span className="opacity-60 tabular-nums"> {COVER_FORMATS[id].ratio}</span>}
                </button>
              ))}
            </div>
          </div>
        ))}
      </Section>

      <Section title={t('cover.palette')}>
        <div className="flex flex-wrap gap-2">
          {COVER_PALETTES.map((p) => (
            <Swatch key={p.id} p={p} on={doc.paletteId === p.id} title={t(`cover.pal.${p.id}`)} onClick={() => update((s) => ({ ...s, paletteId: p.id }))} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-2.5">
          {imagePalettes && (
            <>
              <Swatch p={imagePalettes.light} on={doc.paletteId === 'image'} title={t('cover.paletteImage')} onClick={() => update((s) => ({ ...s, paletteId: 'image' }))} badge={<Icons.Camera size={12} />} />
              <Swatch p={imagePalettes.dark} on={doc.paletteId === 'image-dark'} title={t('cover.paletteImageDark')} onClick={() => update((s) => ({ ...s, paletteId: 'image-dark' }))} badge={<Icons.Camera size={12} />} />
            </>
          )}
          <Swatch p={custom} on={doc.paletteId === 'custom'} title={t('cover.paletteCustom')} onClick={() => update((s) => ({ ...s, paletteId: 'custom' }))} badge={<Icons.Palette size={12} />} />
          <span className="text-[11px] text-[var(--text-dim)] leading-tight">{t('cover.paletteHint')}</span>
        </div>
        {doc.paletteId === 'custom' && (
          <div className="grid grid-cols-3 gap-2 mt-2.5">
            {(['bg', 'fg', 'accent'] as const).map((k) => (
              <label key={k} className="block">
                <span className="block text-[11px] text-[var(--text-dim)] mb-0.5">{t(`cover.color.${k}`)}</span>
                <div className="flex items-center gap-1">
                  <input type="color" value={doc.custom[k]} onChange={(e) => update((s) => ({ ...s, custom: { ...s.custom, [k]: e.target.value.toUpperCase() } }), `custom-${k}`)}
                    className="w-7 h-7 rounded border border-[var(--border)] bg-transparent p-0 shrink-0" aria-label={t(`cover.color.${k}`)} />
                  <input className={`${cls.input} h-[28px] px-1.5 text-[11px] font-mono`} defaultValue={doc.custom[k]} key={doc.custom[k]}
                    onBlur={(e) => { const v = e.target.value.trim(); if (isHex(v)) update((s) => ({ ...s, custom: { ...s.custom, [k]: (v.startsWith('#') ? v : `#${v}`).toUpperCase() } })) }} />
                </div>
              </label>
            ))}
          </div>
        )}
      </Section>

      <Section title={t('cover.type')}>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {TYPE_SETS.map((id) => (
            <button key={id} onClick={() => setDesign({ type: id })} className={chip(d.type === id)}
              style={{ fontFamily: id === 'editorial' || id === 'classic' ? "'Instrument Serif', serif" : id === 'technical' ? "'Geist Mono', monospace" : undefined, fontStyle: id === 'classic' ? 'italic' : undefined, fontWeight: id === 'grotesk' ? 700 : undefined }}>
              {t(`cover.typeSet.${id}`)}
            </button>
          ))}
        </div>
        <Toggle label={t('cover.titleUpper')} checked={d.titleCase === 'upper'} onChange={(v) => setDesign({ titleCase: v ? 'upper' : 'asis' })} />
        <div className="mt-1.5">
          <Slider label={t('cover.titleScale')} value={d.titleScale} min={0.6} max={1.4} step={0.02} onChange={(v) => setDesign({ titleScale: v }, 'titleScale')} format={(v) => `${Math.round(v * 100)}%`} onReset={() => setDesign({ titleScale: 1 })} />
        </div>
      </Section>

      <Section title={t('cover.texture')}>
        <div className="flex flex-wrap gap-1.5">
          {TEXTURES.map((id) => <button key={id} onClick={() => setDesign({ texture: id })} className={chip(d.texture === id)}>{t(`cover.tex.${id}`)}</button>)}
        </div>
      </Section>

      <Section title={t('cover.finish')} right={
        <button className="text-[11px] text-[var(--accent)] hover:underline mb-2" onClick={() => setFine((v) => !v)}>{t(fine ? 'cover.finishLess' : 'cover.finishMore')}</button>
      }>
        <div className="flex flex-wrap gap-1.5">
          {GRADE_PRESET_IDS.map((id) => <button key={id} onClick={() => setDesign({ grade: GRADE_PRESETS[id] })} className={chip(preset === id)}>{t(`cover.grade.${id}`)}</button>)}
        </div>
        {fine && (
          <div className="mt-2.5 space-y-1.5">
            {ADJUST.map((a) => (
              <Slider key={a.key} label={t(`cover.adj.${a.key}`)} value={d.grade[a.key]} min={a.min} max={a.max} step={0.01}
                onChange={(v) => setGrade({ [a.key]: v }, `grade-${a.key}`)} onReset={() => setGrade({ [a.key]: NEUTRAL_GRADE[a.key] })}
                format={(v) => `${v > 0 && a.min < 0 ? '+' : ''}${Math.round(v * 100)}`} />
            ))}
            <div className="flex justify-end"><button className={cls.btnSm} onClick={() => setDesign({ grade: NEUTRAL_GRADE })}>{t('cover.finishReset')}</button></div>
          </div>
        )}
      </Section>

      <Section title={t('cover.options')}>
        <Toggle label={t('cover.showScore')} checked={d.showScore} onChange={(v) => setDesign({ showScore: v })}
          hint={score === null ? t('cover.showScoreNone') : score < 70 ? t('cover.showScoreLow', { score }) : undefined} />
        <Toggle label={t('cover.showQr')} checked={d.showQr} onChange={(v) => setDesign({ showQr: v })}
          hint={d.showQr && !doc.text.website.trim() ? t('cover.qrNeedsSite') : undefined} />
      </Section>

      <Section title={t('cover.styles')}>
        {styles.length === 0 && <div className="text-[11px] text-[var(--text-dim)] mb-2">{t('cover.stylesEmpty')}</div>}
        <div className="space-y-1 mb-2">
          {styles.map((s) => (
            <div key={s.id} className="flex items-center gap-1.5">
              <button className={`${cls.btnSm} flex-1 justify-start min-w-0`} onClick={() => onApplyStyle(s)} title={t('cover.styleApply')}>
                <span className="w-3 h-3 rounded-full shrink-0 border border-[var(--border)]" style={{ background: s.paletteId === 'custom' ? s.custom.accent : COVER_PALETTES.find((p) => p.id === s.paletteId)?.accent ?? '#888' }} />
                <span className="truncate">{s.name}</span>
                <span className="ml-auto text-[10.5px] text-[var(--text-dim)] shrink-0">{t(`cover.tpl.${s.template}`)}</span>
              </button>
              <button className={cls.icon} onClick={() => onDeleteStyle(s.id)} title={t('cover.styleDelete')} aria-label={t('cover.styleDelete')}><Icons.Trash size={13} /></button>
            </div>
          ))}
        </div>
        <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (styleName.trim()) { onSaveStyle(styleName.trim()); setStyleName('') } }}>
          <input className={cls.input} value={styleName} maxLength={60} placeholder={t('cover.styleName')} onChange={(e) => setStyleName(e.target.value)} />
          <button type="submit" className={cls.btn} disabled={!styleName.trim()}><Icons.Plus size={13} />{t('cover.styleSave')}</button>
        </form>
      </Section>
    </div>
  )
}
