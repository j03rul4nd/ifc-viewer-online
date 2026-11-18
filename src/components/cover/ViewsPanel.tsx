// ─── Views tab: light, render style, captures, cuts, and the shot list ────────

import { useTranslation } from 'react-i18next'
import * as Icons from '../Icons'
import { LOOKS, LOOK_IDS, type LookId } from '../../lib/cover/looks'
import { LIGHTS, LIGHT_IDS, type LightId } from '../../lib/cover/lighting'
import { CUT_MODES, type CutMode } from '../../lib/cover/cuts'
import type { ShotCrop } from '../../lib/cover/types'
import type { History } from './useHistory'
import type { StudioDoc } from './doc'
import type { BusyKind, CaptureRes } from './useCoverCapture'
import ShotTile from './ShotTile'
import { Section, Slider, chip, cls } from './ui'

const CAPTURE_RES: readonly CaptureRes[] = [1, 2, 4]

interface Props {
  doc: StudioDoc
  update: History<StudioDoc>['update']
  busy: BusyKind | null
  shotPx: { w: number; h: number } | null
  res: CaptureRes; setRes: (r: CaptureRes) => void
  light: LightId; setLight: (l: LightId) => void
  sunAzimuth: number | null; setSunAzimuth: (a: number | null) => void
  look: LookId; setLook: (l: LookId) => void
  categories: Array<{ id: string; label: string; count: number }>
  focusCat: string | null; setFocusCat: (c: string | null) => void
  cut: CutMode; setCut: (c: CutMode) => void
  cutAt: number; setCutAt: (v: number) => void
  spread: number; setSpread: (v: number) => void
  onCurrent: () => void
  onAuto: () => void
  onPack: () => void
  onCut: () => void
  onExplode: () => void
  onPlans: () => void
  onFrameFocus: () => void
}

export default function ViewsPanel(p: Props) {
  const { t } = useTranslation('capture')
  const { doc, update, busy } = p
  const shots = doc.shots
  const setShots = (fn: (s: StudioDoc['shots']) => StudioDoc['shots'], coalesce?: string) => update((d) => ({ ...d, shots: fn(d.shots) }), coalesce)
  const busyLabel = t('cover.autoShotsBusy')
  const lightAz = p.sunAzimuth ?? LIGHTS[p.light].light?.azimuth ?? 0

  return (
    <div className="space-y-5">
      <Section title={t('cover.light')}>
        <div className="flex flex-wrap gap-1.5">
          {LIGHT_IDS.map((id) => (
            <button key={id} onClick={() => p.setLight(id)} className={chip(p.light === id)} title={t(`cover.lightHint.${id}`)}>
              {LIGHTS[id].sky && <span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-[-1px] border border-black/10" style={{ background: `linear-gradient(${LIGHTS[id].sky!.top}, ${LIGHTS[id].sky!.bottom})` }} />}
              {t(`cover.lightName.${id}`)}
            </button>
          ))}
        </div>
        {p.light !== 'studio' && (
          <div className="mt-2">
            <Slider label={t('cover.sun')} value={lightAz} min={0} max={359} step={1} onChange={(v) => p.setSunAzimuth(v)} onReset={() => p.setSunAzimuth(null)} format={(v) => `${Math.round(v)}°`} />
          </div>
        )}
        <div className="text-[11px] text-[var(--text-dim)] mt-1.5">{t('cover.lightNote')}</div>
      </Section>

      <Section title={t('cover.lookTitle')}>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {LOOK_IDS.map((id) => (
            <button key={id} onClick={() => p.setLook(id)} className={chip(p.look === id)} title={t(`cover.lookHint.${id}`)}>{t(`cover.look.${id}`)}</button>
          ))}
        </div>
        <label className="block mb-2">
          <span className="block text-[11px] text-[var(--text-dim)] mb-0.5">{t('cover.focus')}</span>
          <div className="flex gap-1.5">
            <select className={cls.input} value={p.focusCat ?? ''} onChange={(e) => p.setFocusCat(e.target.value || null)}>
              <option value="">{t('cover.focusNone')}</option>
              {p.categories.map((c) => <option key={c.id} value={c.id}>{c.label} ({c.count})</option>)}
            </select>
            <button className={cls.btn} onClick={p.onFrameFocus} disabled={!p.focusCat || !!busy} title={t('cover.frameFocus')} aria-label={t('cover.frameFocus')}><Icons.Search size={13} /></button>
          </div>
        </label>
        {LOOKS[p.look].wantsFocus && !p.focusCat && <div className="text-[11px] text-[var(--warn,#F5A623)] mb-2">{t('cover.focusHint')}</div>}
      </Section>

      <Section title={t('cover.shots')}>
        <div className="flex items-center gap-1.5 mb-2" title={t('cover.resolutionHint')}>
          <span className="text-[11px] text-[var(--text-dim)] mr-1">{t('cover.resolution')}</span>
          {CAPTURE_RES.map((r) => <button key={r} onClick={() => p.setRes(r)} className={chip(p.res === r)}>{r}×</button>)}
          {p.shotPx && <span className="text-[11px] text-[var(--text-dim)] tabular-nums ml-1">≈ {p.shotPx.w * p.res}×{p.shotPx.h * p.res}px</span>}
        </div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          <button className={cls.btn} onClick={p.onCurrent} disabled={!!busy}><Icons.Camera size={13} />{busy === 'shots' ? busyLabel : t('cover.captureView')}</button>
          <button className={cls.btn} onClick={p.onAuto} disabled={!!busy}><Icons.Sparkles size={13} />{t('cover.autoShots')}</button>
          <button className={cls.btn} onClick={p.onPack} disabled={!!busy} title={t('cover.stylePackHint')}><Icons.Palette size={13} />{busy === 'pack' ? busyLabel : t('cover.stylePack')}</button>
        </div>
        <div className={`${cls.card} mb-2 space-y-2`}>
          <div className="text-[11px] text-[var(--text-dim)]">{t('cover.cutTitle')}</div>
          <div className="flex flex-wrap gap-1.5">
            {CUT_MODES.map((m) => <button key={m} onClick={() => p.setCut(m)} className={chip(p.cut === m)}>{t(`cover.cut.${m}`)}</button>)}
          </div>
          {p.cut !== 'none' && (
            <>
              <Slider label={t('cover.cutAt')} value={p.cutAt} min={0.05} max={0.95} step={0.01} onChange={p.setCutAt} format={(v) => `${Math.round(v * 100)}%`} />
              <button className={cls.btn} onClick={p.onCut} disabled={!!busy}>{busy === 'cut' ? busyLabel : t('cover.captureCut')}</button>
            </>
          )}
          <div className="h-px bg-[var(--border)]" />
          <Slider label={t('cover.explodeSpread')} value={p.spread} min={0.3} max={2.5} step={0.05} onChange={p.setSpread} format={(v) => `${v.toFixed(1)}×`} />
          <div className="flex flex-wrap gap-1.5">
            <button className={cls.btn} onClick={p.onExplode} disabled={!!busy}><Icons.Layers size={13} />{busy === 'explode' ? busyLabel : t('cover.explode')}</button>
            <button className={cls.btn} onClick={p.onPlans} disabled={!!busy}><Icons.Building size={13} />{busy === 'plans' ? busyLabel : t('cover.storeyPlans')}</button>
          </div>
        </div>
        <div className="text-[11px] text-[var(--text-dim)] mb-2">{t('cover.shotsHint')}</div>
        <div className="grid grid-cols-2 gap-2">
          {shots.map((s, i) => (
            <ShotTile key={s.id} shot={s} index={i} count={shots.length}
              onHero={() => setShots((list) => (i <= 0 ? list : [list[i], ...list.slice(0, i), ...list.slice(i + 1)]))}
              onRemove={() => setShots((list) => list.filter((x) => x.id !== s.id))}
              onRename={(label) => setShots((list) => list.map((x) => (x.id === s.id ? { ...x, label } : x)), `rename-${s.id}`)}
              onCrop={(crop: ShotCrop | undefined) => setShots((list) => list.map((x) => (x.id === s.id ? { ...x, crop } : x)), `crop-${s.id}`)}
              onMove={(dir) => setShots((list) => {
                const j = i + dir
                if (j < 0 || j >= list.length) return list
                const next = [...list]
                ;[next[i], next[j]] = [next[j], next[i]]
                return next
              })}
            />
          ))}
        </div>
      </Section>
    </div>
  )
}
