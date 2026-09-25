// ─── Map panel sub-flows ──────────────────────────────────────────────────────
// Steps that take over the panel body: the questions the map cannot start
// without (a coordinate system, a location), the licence sheets, the placement
// editor, and the one-time tile consent.
//
// One at a time, full width, with a way back out: burying "we need a coordinate
// system" inside a tab is how the old panel left people staring at a button
// that appeared to do nothing.

import React, { Suspense, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useGeoStore } from '../../stores/geoStore'
import { useSceneStore } from '../../stores/sceneStore'
import { WGS84_RADIUS, normalizeDeg } from '../../lib/geo/geo-math'
import { useGeoCtl } from './useGeoController'
import { useModelSites } from './useModelSites'
import { Button, Field, Hint, LookSlider, Notice, NudgeBtn, Sheet } from './ui'

// Leaflet (~150 kB) loads only when a map surface is actually shown — opening
// the panel to read a georeferencing status must not pay for it.
const PlacementMiniMap = React.lazy(() => import('../PlacementMiniMap'))

const MINIMAP_FALLBACK = <div className="h-[150px] rounded-[8px] bg-[var(--surface-2)] animate-pulse" />

/**
 * Where the manual-placement map opens before the user has chosen anything.
 * Deliberately NOT 0,0 (null island reads as a real answer) and deliberately
 * not the device's location, which would need a permission prompt nobody asked
 * for. Barcelona matches the placeholder coordinates in the inputs.
 */
const MANUAL_FALLBACK = { lat: 41.3851, lon: 2.1734 }

const DEG = Math.PI / 180
const RAD = 180 / Math.PI

// ── Coordinate system needed ────────────────────────────────────────────────

export function CrsStep({ epsg }: { epsg: string }) {
  const { t } = useTranslation('geo')
  const ctl = useGeoCtl()
  const [code, setCode] = useState(epsg)
  const [proj4, setProj4] = useState('')
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)

  const apply = async (): Promise<void> => {
    setError(false)
    setBusy(true)
    const ok = await ctl.applyCrs(code, proj4)
    setBusy(false)
    if (!ok) setError(true)
  }

  return (
    <Sheet title={t('crs.title')} onBack={() => ctl.setFlow(null)} backLabel={t('panel.back')}>
      <p className="text-[10.5px] text-[var(--text-dim)] leading-snug">
        {t('crs.body', { name: epsg || '?' })}
      </p>
      <Field label={t('crs.epsgLabel')}>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t('crs.epsgPlaceholder')} className="geo-input" />
      </Field>
      <Field label={t('crs.proj4Label')}>
        <input value={proj4} onChange={(e) => setProj4(e.target.value)} placeholder={t('crs.proj4Placeholder')} className="geo-input" />
      </Field>
      {error && <Notice tone="danger">{t('crs.invalid')}</Notice>}
      <Button variant="primary" onClick={() => { void apply() }} disabled={busy}>{t('crs.apply')}</Button>
      {/* Not knowing the CRS must not be a dead end. */}
      <button
        onClick={() => ctl.setFlow({ kind: 'manual' })}
        className="self-start text-[11px] text-[var(--accent-2)] hover:underline underline-offset-2"
      >
        {t('placement.manualShow')}
      </button>
    </Sheet>
  )
}

// ── Place manually ──────────────────────────────────────────────────────────

export function ManualStep() {
  const { t } = useTranslation('geo')
  const ctl = useGeoCtl()
  const consentGiven = useGeoStore((s) => s.consentGiven)
  const { otherPins } = useModelSites(ctl.viewerApiRef)
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')
  const la = parseFloat(lat)
  const lo = parseFloat(lon)
  const valid = Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 85 && Math.abs(lo) <= 180

  return (
    <Sheet title={t('placement.manualShow')} onBack={() => ctl.setFlow(null)} backLabel={t('panel.back')}>
      <p className="text-[10.5px] text-[var(--text-dim)] leading-snug">{t('placement.manualIntro')}</p>

      {/* Pick on a real map instead of guessing two numbers. Gated on the same
          consent as 3D map mode — it fetches tiles. */}
      {consentGiven && (
        <Suspense fallback={MINIMAP_FALLBACK}>
          <PlacementMiniMap
            lat={Number.isFinite(la) ? la : MANUAL_FALLBACK.lat}
            lon={Number.isFinite(lo) ? lo : MANUAL_FALLBACK.lon}
            onChange={(a, b) => { setLat(a.toFixed(6)); setLon(b.toFixed(6)) }}
            otherPins={otherPins}
          />
        </Suspense>
      )}

      <div className="flex gap-1.5">
        <Field label={t('placement.lat')} className="flex-1 min-w-0">
          <input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="41.3851" inputMode="decimal" className="geo-input" />
        </Field>
        <Field label={t('placement.lon')} className="flex-1 min-w-0">
          <input value={lon} onChange={(e) => setLon(e.target.value)} placeholder="2.1734" inputMode="decimal" className="geo-input" />
        </Field>
      </div>
      <Button variant="primary" onClick={() => { void ctl.applyManual(la, lo) }} disabled={!valid}>
        {t('enable.show')}
      </Button>
    </Sheet>
  )
}

// ── Satellite terms ─────────────────────────────────────────────────────────

export function TermsSheet() {
  const { t } = useTranslation('geo')
  const ctl = useGeoCtl()
  const options = [
    { id: 'esri-imagery', note: t('layers.esriNote') },
    { id: 'eox-s2', note: t('layers.eoxNote') },
    { id: 'gibs', note: t('layers.gibsNote') },
  ]
  return (
    <Sheet title={t('layers.termsTitle')} onBack={() => ctl.setFlow(null)} backLabel={t('panel.back')}>
      <p className="text-[10px] text-[var(--text-dim)] leading-snug">{t('layers.termsBody')}</p>
      {options.map((opt) => (
        <button
          key={opt.id}
          onClick={() => ctl.acceptTerms(opt.id)}
          className="text-left px-2.5 py-2 rounded-[8px] border border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--surface-2)] transition-colors"
        >
          <div className="text-[10.5px] leading-snug text-[var(--text-dim)]">{opt.note}</div>
          <div className="text-[10px] text-[var(--accent-2)] mt-0.5">{t('layers.accept')}</div>
        </button>
      ))}
    </Sheet>
  )
}

// ── Custom tile source ──────────────────────────────────────────────────────

export function CustomSourceSheet() {
  const { t } = useTranslation('geo')
  const ctl = useGeoCtl()
  const [url, setUrl] = useState('')
  const [attr, setAttr] = useState('')
  const [error, setError] = useState(false)
  return (
    <Sheet title={t('layers.customTitle')} onBack={() => ctl.setFlow(null)} backLabel={t('panel.back')}>
      <Field label={t('layers.customUrl')}>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t('layers.customUrlPlaceholder')} className="geo-input" />
      </Field>
      <Field label={t('layers.customAttribution')}>
        <input value={attr} onChange={(e) => setAttr(e.target.value)} className="geo-input" />
      </Field>
      {error && <Notice tone="danger">{t('layers.customInvalid')}</Notice>}
      <Button variant="primary" onClick={() => setError(!ctl.saveCustomSource(url, attr))}>
        {t('layers.customSave')}
      </Button>
    </Sheet>
  )
}

// ── Placement editor ────────────────────────────────────────────────────────

/**
 * Fine placement, as its own step in BOTH faces of the panel.
 *
 * It used to live only at the bottom of the Placement tab, which a Basic user
 * never opens — while "the model is ten metres off" is exactly what a Basic
 * user notices first. Back is Cancel: nothing is applied until Apply.
 */
export function PlacementEditor() {
  const { t } = useTranslation('geo')
  const ctl = useGeoCtl()
  const draft = useGeoStore((s) => s.draftPlacement)
  const updateDraft = useGeoStore((s) => s.updateDraft)
  const consentGiven = useGeoStore((s) => s.consentGiven)
  const { modelSites, otherPins } = useModelSites(ctl.viewerApiRef)
  const [picking, setPicking] = useState(false)
  const { getGeo } = ctl

  // Pick-on-map: one quick click places the draft (no drag conflicts with orbit).
  useEffect(() => {
    if (!picking) return
    let downX = 0, downY = 0
    const onDown = (e: PointerEvent): void => { downX = e.clientX; downY = e.clientY }
    const onUp = (e: PointerEvent): void => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return
      if (!(e.target instanceof HTMLCanvasElement)) return
      void getGeo()?.then((geo) => {
        const hit = geo.pickGround(e.clientX, e.clientY)
        if (hit) {
          useGeoStore.getState().updateDraft({ lat: hit.lat, lon: hit.lon })
          setPicking(false)
        }
      })
    }
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setPicking(false) }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('pointerup', onUp)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('pointerup', onUp)
      window.removeEventListener('keydown', onKey)
    }
  }, [picking, getGeo])

  if (!draft) return null

  const nudge = (dEastM: number, dNorthM: number): void => {
    const d = useGeoStore.getState().draftPlacement
    if (!d) return
    updateDraft({
      lat: d.lat + (dNorthM / WGS84_RADIUS) * RAD,
      lon: d.lon + (dEastM / (WGS84_RADIUS * Math.cos(d.lat * DEG))) * RAD,
    })
  }

  return (
    <Sheet
      title={t('placement.edit')}
      onBack={() => { setPicking(false); void ctl.finishEditPlacement(false) }}
      backLabel={t('placement.cancel')}
    >
      {consentGiven && (
        <Suspense fallback={MINIMAP_FALLBACK}>
          <PlacementMiniMap
            lat={draft.lat}
            lon={draft.lon}
            onChange={(la, lo) => updateDraft({ lat: la, lon: lo })}
            otherPins={otherPins}
            fitAll={modelSites.farApart}
          />
        </Suspense>
      )}

      <div className="flex gap-1.5">
        <Field label={t('placement.lat')} className="flex-1 min-w-0">
          <NumberInput value={draft.lat} onCommit={(v) => updateDraft({ lat: v })} />
        </Field>
        <Field label={t('placement.lon')} className="flex-1 min-w-0">
          <NumberInput value={draft.lon} onCommit={(v) => updateDraft({ lon: v })} />
        </Field>
      </div>

      <LookSlider
        label={t('placement.rotation')}
        value={normalizeDeg(draft.rotationDeg)}
        min={0} max={360} step={0.5}
        format={(v) => `${v.toFixed(0)}°`}
        onChange={(v) => updateDraft({ rotationDeg: v })}
      />

      <div className="flex items-end gap-1.5">
        <Field label={t('placement.height')} className="flex-1">
          <NumberInput value={draft.heightOffsetM} onCommit={(v) => updateDraft({ heightOffsetM: v })} step={0.5} />
        </Field>
        <button
          onClick={() => updateDraft({ heightOffsetM: 0 })}
          className="h-[26px] px-2 text-[10px] text-[var(--text-faint)] hover:text-[var(--text)] transition-colors"
        >
          {t('placement.resetHeight')}
        </button>
      </div>

      {/* Nudge pad — a d-pad reads as one control, where a row of arrows read
          as four unrelated buttons. */}
      <div className="flex items-center gap-2.5">
        <div className="grid grid-cols-3 gap-0.5 shrink-0" role="group" aria-label={t('placement.nudge')}>
          <span />
          <NudgeBtn label="↑" ariaLabel={`${t('placement.nudge')} N 10 m`} onClick={() => nudge(0, 10)} />
          <span />
          <NudgeBtn label="←" ariaLabel={`${t('placement.nudge')} W 10 m`} onClick={() => nudge(-10, 0)} />
          <span className="w-6 h-6 flex items-center justify-center text-[9px] text-[var(--text-faint)]">10m</span>
          <NudgeBtn label="→" ariaLabel={`${t('placement.nudge')} E 10 m`} onClick={() => nudge(10, 0)} />
          <span />
          <NudgeBtn label="↓" ariaLabel={`${t('placement.nudge')} S 10 m`} onClick={() => nudge(0, -10)} />
          <span />
        </div>
        <button
          onClick={() => setPicking((v) => !v)}
          aria-pressed={picking}
          className={[
            'flex-1 h-[30px] rounded-[8px] text-[11px] font-medium border transition-colors',
            picking
              ? 'border-[var(--accent)] text-[var(--accent-2)] bg-[rgba(94,106,210,0.10)]'
              : 'border-[var(--border-strong)] text-[var(--text-dim)] hover:text-[var(--text)]',
          ].join(' ')}
        >
          {picking ? t('placement.picking') : t('placement.pick')}
        </button>
      </div>

      <div className="flex gap-1.5">
        <Button variant="primary" className="flex-1" onClick={() => { setPicking(false); void ctl.finishEditPlacement(true) }}>
          {t('placement.apply')}
        </Button>
        <Button variant="secondary" className="flex-1" onClick={() => { setPicking(false); void ctl.finishEditPlacement(false) }}>
          {t('placement.cancel')}
        </Button>
      </div>
      <Hint>{t('status.confidenceApproximate')}</Hint>
    </Sheet>
  )
}

/**
 * A numeric field that lets you TYPE.
 *
 * The editor's inputs used to be controlled by `String(value)`: typing "41."
 * parsed to 41, re-rendered as "41", and the decimal point vanished — so a
 * coordinate could be pasted but not typed. The text is local while the field
 * has focus; outside edits (dragging the pin, the nudge pad) flow in whenever
 * it does not.
 */
function NumberInput({ value, onCommit, step }: { value: number; onCommit: (v: number) => void; step?: number }) {
  const [text, setText] = useState(String(value))
  const focused = useRef(false)
  useEffect(() => { if (!focused.current) setText(String(value)) }, [value])
  return (
    <input
      value={text}
      inputMode="decimal"
      step={step}
      className="geo-input"
      onFocus={() => { focused.current = true }}
      onBlur={() => { focused.current = false; setText(String(value)) }}
      onChange={(e) => {
        setText(e.target.value)
        const v = parseFloat(e.target.value)
        if (Number.isFinite(v)) onCommit(v)
      }}
      onKeyDown={(e) => {
        if (step === undefined || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
        e.preventDefault()
        const next = Math.round((value + (e.key === 'ArrowUp' ? step : -step)) * 1000) / 1000
        setText(String(next))
        onCommit(next)
      }}
    />
  )
}

// ── Tile consent ────────────────────────────────────────────────────────────

/** Shown once, before the first tile request. */
export function ConsentDialog() {
  const { t } = useTranslation('geo')
  const ctl = useGeoCtl()
  const open = ctl.flow?.kind === 'consent'
  const activeModelId = useSceneStore((s) => s.activeModelId)
  return (
    <AnimatePresence>
      {open && activeModelId && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="absolute inset-0 z-30 flex items-center justify-center bg-[rgba(0,0,0,0.5)] pointer-events-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="geo-consent-title"
          onKeyDown={(e) => { if (e.key === 'Escape') ctl.setFlow(null) }}
        >
          <div className="glass-md border border-[var(--border-strong)] rounded-[12px] p-4 max-w-[340px] mx-3">
            <div id="geo-consent-title" className="text-[13px] font-semibold mb-1.5">{t('consent.title')}</div>
            <div className="text-[11.5px] text-[var(--text-dim)] leading-relaxed mb-3">{t('consent.body')}</div>
            <div className="flex gap-2">
              <Button variant="primary" className="flex-1" autoFocus onClick={ctl.acceptConsent}>
                {t('consent.accept')}
              </Button>
              <Button variant="secondary" className="flex-1" onClick={() => ctl.setFlow(null)}>
                {t('consent.cancel')}
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
