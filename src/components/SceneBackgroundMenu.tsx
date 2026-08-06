// ─── SceneBackgroundMenu ───────────────────────────────────────────────────────
// Backdrop picker for the 3D scene, mounted next to the capture controls — the
// place where it is actually needed: users shooting stills and clips for a
// client deck usually want white, a soft studio sweep, or their company colour
// instead of the default near-black studio.
//
// Self-contained: reads/writes sceneStore only (Viewer.tsx pushes the change
// into the renderer). All state is device-local — no network, no account.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as Icons from './Icons'
import { useSceneStore } from '../stores/sceneStore'
import {
  BACKGROUND_PRESETS, DEFAULT_BACKGROUND,
  normalizeHex, settingsFromPreset, resolveBackground,
  type BackgroundPresetId, type BackgroundSettings,
} from '../lib/scene/background'

/** CSS paint for a swatch — mirrors what the renderer will show. */
function swatchStyle(settings: Pick<BackgroundSettings, 'mode' | 'top' | 'bottom'>): React.CSSProperties {
  return settings.mode === 'gradient'
    ? { background: `linear-gradient(180deg, ${settings.top}, ${settings.bottom})` }
    : { background: settings.top }
}

interface SceneBackgroundMenuProps {
  /** Disabled until a model is on screen (nothing to restyle otherwise). */
  disabled?: boolean
}

export function SceneBackgroundMenu({ disabled = false }: SceneBackgroundMenuProps) {
  const { t } = useTranslation('capture')
  const background = useSceneStore((s) => s.background)
  const setBackground = useSceneStore((s) => s.setBackground)

  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  // Local text state so a half-typed hex ("#0a") never reaches the scene.
  const [topDraft, setTopDraft] = useState(background.top)
  const [bottomDraft, setBottomDraft] = useState(background.bottom)
  useEffect(() => {
    setTopDraft(background.top)
    setBottomDraft(background.bottom)
  }, [background.top, background.bottom])

  // Esc closes — matches every other toolbar popover.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const choosePreset = useCallback((id: BackgroundPresetId) => {
    setBackground(settingsFromPreset(id, background))
  }, [background, setBackground])

  const setCustomColor = useCallback((which: 'top' | 'bottom', raw: string) => {
    const hex = normalizeHex(raw)
    if (!hex) return
    setBackground({
      ...background,
      preset: 'custom',
      [which]: hex,
      // Picking a single colour while a preset gradient was active would leave a
      // stale second stop; keep solid mode's stops in lockstep.
      ...(background.mode === 'solid' ? { top: hex, bottom: hex } : {}),
    })
  }, [background, setBackground])

  const setMode = useCallback((mode: 'solid' | 'gradient') => {
    setBackground({ ...background, preset: 'custom', mode })
  }, [background, setBackground])

  const isDefault =
    background.preset === DEFAULT_BACKGROUND.preset &&
    background.top === DEFAULT_BACKGROUND.top

  const resolved = resolveBackground(background)
  const btnBase = 'inline-flex items-center gap-1.5 px-2.5 h-[28px] rounded-[5px] text-[12px] font-medium transition-colors duration-100 whitespace-nowrap select-none justify-center text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] active:opacity-80 disabled:opacity-35 disabled:cursor-not-allowed'
  const swatchBase = 'relative h-[26px] rounded-[5px] border transition-transform duration-100 hover:scale-[1.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]'

  return (
    <div ref={rootRef} className="relative flex items-center">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        title={t('background.tooltip')}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={btnBase}
      >
        <Icons.Palette size={13} />
        {/* Live swatch doubles as the "what is set right now" indicator. */}
        <span
          className="w-[9px] h-[9px] rounded-[2px] border border-[var(--border-strong)]"
          style={swatchStyle(resolved)}
        />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[59]" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-label={t('background.title')}
            className="absolute right-0 top-full mt-1.5 w-[240px] bg-[var(--surface)] border border-[var(--border-strong)] rounded-[10px] shadow-2xl z-[60] p-2.5 flex flex-col gap-2.5"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[var(--text)]">{t('background.title')}</span>
              {!isDefault && (
                <button
                  onClick={() => setBackground(DEFAULT_BACKGROUND)}
                  className="text-[10px] text-[var(--text-dim)] hover:text-[var(--text)] underline"
                >
                  {t('background.reset')}
                </button>
              )}
            </div>

            {/* Presets */}
            <div className="grid grid-cols-5 gap-1.5">
              {BACKGROUND_PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => choosePreset(p.id)}
                  title={t(`background.presets.${p.id}`)}
                  aria-label={t(`background.presets.${p.id}`)}
                  aria-pressed={background.preset === p.id}
                  style={swatchStyle(p)}
                  className={`${swatchBase} ${
                    background.preset === p.id
                      ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]'
                      : 'border-[var(--border-strong)]'
                  }`}
                />
              ))}
            </div>

            <div className="h-px bg-[var(--border)]" />

            {/* Custom colours — the "our company blue" case */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-[var(--text-dim)]">{t('background.custom')}</span>
                <div className="flex items-center gap-0.5 rounded-[5px] bg-[var(--surface-2)] border border-[var(--border-strong)] p-0.5">
                  {(['solid', 'gradient'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      className={`px-1.5 h-[18px] rounded-[3px] text-[10px] font-medium transition-colors ${
                        background.mode === m
                          ? 'bg-[var(--accent)] text-white'
                          : 'text-[var(--text-dim)] hover:text-[var(--text)]'
                      }`}
                    >
                      {t(`background.mode.${m}`)}
                    </button>
                  ))}
                </div>
              </div>

              <ColorRow
                label={background.mode === 'gradient' ? t('background.topColor') : t('background.color')}
                value={topDraft}
                onPick={(v) => setCustomColor('top', v)}
                onDraft={setTopDraft}
              />
              {background.mode === 'gradient' && (
                <ColorRow
                  label={t('background.bottomColor')}
                  value={bottomDraft}
                  onPick={(v) => setCustomColor('bottom', v)}
                  onDraft={setBottomDraft}
                />
              )}
            </div>

            <p className="text-[10px] leading-snug text-[var(--text-faint)]">
              {t('background.hint')}
            </p>
          </div>
        </>
      )}
    </div>
  )
}

// ── Colour row: native picker + hex field, both committing normalised values ───

interface ColorRowProps {
  label: string
  value: string
  onPick: (hex: string) => void
  onDraft: (raw: string) => void
}

function ColorRow({ label, value, onPick, onDraft }: ColorRowProps) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-[11px] text-[var(--text-dim)] flex-1">{label}</span>
      <input
        type="color"
        value={normalizeHex(value) ?? '#000000'}
        onChange={(e) => onPick(e.target.value)}
        className="w-[26px] h-[22px] rounded-[4px] bg-transparent border border-[var(--border-strong)] cursor-pointer p-0"
        aria-label={label}
      />
      <input
        type="text"
        value={value}
        spellCheck={false}
        onChange={(e) => {
          onDraft(e.target.value)
          // Commit only once the draft is a complete, valid colour.
          const hex = normalizeHex(e.target.value)
          if (hex) onPick(hex)
        }}
        className="w-[74px] bg-[var(--surface-2)] border border-[var(--border-strong)] rounded-[4px] px-1.5 h-[22px] text-[11px] font-mono text-[var(--text)] outline-none focus:border-[var(--accent)]"
        aria-label={`${label} (hex)`}
      />
    </label>
  )
}
