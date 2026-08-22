// ─── EmbedModal ───────────────────────────────────────────────────────────────
// Generates a paste-ready embed URL and <iframe> snippet so the viewer can be
// dropped into a blog, article, or CDE panel. Purely client-side: the host's
// browser fetches the IFC from the public URL the user provides (CORS required).

import React, { useState, useMemo, useEffect } from 'react'
import { Modal } from './Modal'
import { useTranslation } from 'react-i18next'
import * as Icons from './Icons'
import {
  buildEmbedUrl,
  buildIframeSnippet,
  isLoadableUrl,
  type EmbedUiPreset,
} from '../lib/url-params'

interface EmbedModalProps {
  /** Prefill the model URL (set when the current model was opened from ?model=). */
  defaultModelUrl?: string
  /** Current UI language, offered as the "force language" value. */
  defaultLang?: string
  onClose: () => void
}

const PRESETS: EmbedUiPreset[] = ['minimal', 'full', 'kiosk', 'client']

export default function EmbedModal({ defaultModelUrl, defaultLang, onClose }: EmbedModalProps) {
  const { t } = useTranslation('toolbar')

  const [modelUrl, setModelUrl]         = useState(defaultModelUrl ?? '')
  const [preset, setPreset]             = useState<EmbedUiPreset>('minimal')
  const [autoValidate, setAutoValidate] = useState(true)
  const [openPanel, setOpenPanel]       = useState(false)
  const [forceLang, setForceLang]       = useState(false)
  const [accent, setAccent]             = useState('#5E6AD2')
  const [height, setHeight]             = useState(600)
  const [tab, setTab]                   = useState<'iframe' | 'url'>('iframe')
  const [copied, setCopied]             = useState<'iframe' | 'url' | null>(null)

  const trimmedUrl = modelUrl.trim()
  const validUrl   = isLoadableUrl(trimmedUrl)

  const baseUrl = useMemo(() => {
    if (typeof window === 'undefined') return '/'
    const base = import.meta.env.BASE_URL ?? '/'
    return window.location.origin + (base.endsWith('/') ? base : `${base}/`)
  }, [])

  const embedUrl = useMemo(() => {
    if (!validUrl) return ''
    return buildEmbedUrl({
      baseUrl,
      modelUrl: trimmedUrl,
      preset,
      autoValidate,
      openPanel,
      lang: forceLang ? defaultLang : undefined,
      accent: accent.toLowerCase() !== '#5e6ad2' ? accent : undefined,
    })
  }, [validUrl, baseUrl, trimmedUrl, preset, autoValidate, openPanel, forceLang, defaultLang, accent])

  const snippet = useMemo(
    () => (embedUrl ? buildIframeSnippet(embedUrl, { height }) : ''),
    [embedUrl, height],
  )

  const copy = async (which: 'iframe' | 'url'): Promise<void> => {
    const text = which === 'url' ? embedUrl : snippet
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(which)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      /* clipboard blocked — user can still select the text manually */
    }
  }

  const codeText = tab === 'url' ? embedUrl : snippet

  return (
    <Modal open onClose={onClose} title={t('embedModal.title')} size="md">

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-4 py-4 flex flex-col gap-4">
          <p className="text-[12px] text-[var(--text-dim)] leading-relaxed">
            {t('embedModal.intro')}
          </p>

          {/* Model URL */}
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold text-[var(--text-dim)] uppercase tracking-wider">
              {t('embedModal.modelUrlLabel')}
            </span>
            <input
              type="url"
              value={modelUrl}
              onChange={(e) => setModelUrl(e.target.value)}
              placeholder={t('embedModal.modelUrlPlaceholder')}
              spellCheck={false}
              className="w-full px-3 h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[12px] text-[var(--text)] font-mono outline-none focus:border-[var(--accent)] transition-colors"
              style={modelUrl && !validUrl ? { borderColor: 'var(--danger)' } : undefined}
            />
            <span className="text-[10.5px] text-[var(--text-faint)] leading-snug">
              {t('embedModal.modelUrlHelp')}
            </span>
          </label>

          {/* Layout preset */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold text-[var(--text-dim)] uppercase tracking-wider">
              {t('embedModal.presetLabel')}
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => setPreset(p)}
                  className={[
                    'flex flex-col items-start gap-0.5 px-2.5 py-2 rounded-lg border text-left transition-colors',
                    preset === p
                      ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                      : 'border-[var(--border)] hover:border-[var(--border-strong)]',
                  ].join(' ')}
                >
                  <span className="text-[12px] font-medium text-[var(--text)]">{t(`embedModal.preset.${p}`)}</span>
                  <span className="text-[10px] text-[var(--text-faint)] leading-tight">{t(`embedModal.preset.${p}Desc`)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Options */}
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold text-[var(--text-dim)] uppercase tracking-wider">
              {t('embedModal.optionsLabel')}
            </span>
            <CheckRow checked={autoValidate} onChange={setAutoValidate} label={t('embedModal.autoValidate')} />
            <CheckRow checked={openPanel}    onChange={setOpenPanel}    label={t('embedModal.openPanel')} />
            {defaultLang && (
              <CheckRow
                checked={forceLang}
                onChange={setForceLang}
                label={t('embedModal.forceLang', { lang: defaultLang.toUpperCase() })}
              />
            )}
            <label className="flex items-center justify-between gap-3 mt-0.5">
              <span className="text-[12px] text-[var(--text-dim)]">{t('embedModal.heightLabel')}</span>
              <input
                type="number"
                min={240}
                max={2000}
                step={20}
                value={height}
                onChange={(e) => setHeight(Math.max(240, Math.min(2000, Number(e.target.value) || 600)))}
                className="w-24 px-2 h-8 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[12px] text-[var(--text)] font-mono outline-none focus:border-[var(--accent)]"
              />
            </label>
            <label className="flex items-center justify-between gap-3 mt-0.5">
              <span className="text-[12px] text-[var(--text-dim)]">{t('embedModal.accentLabel')}</span>
              <input
                type="color"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                className="w-12 h-8 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] cursor-pointer p-0.5"
                title={t('embedModal.accentLabel')}
              />
            </label>
          </div>

          {/* Generated code */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1">
              <TabBtn active={tab === 'iframe'} onClick={() => setTab('iframe')}>{t('embedModal.iframeTab')}</TabBtn>
              <TabBtn active={tab === 'url'}    onClick={() => setTab('url')}>{t('embedModal.urlTab')}</TabBtn>
              <div className="flex-1" />
              {validUrl && (
                <a
                  href={embedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-[var(--text-dim)] hover:text-[var(--accent)] flex items-center gap-1 transition-colors"
                >
                  {t('embedModal.openPreview')}
                  <Icons.ArrowRight size={11} />
                </a>
              )}
            </div>

            {validUrl ? (
              <div className="relative">
                <pre className="m-0 px-3 py-2.5 pr-12 rounded-lg bg-[#0a0a0d] border border-[var(--border)] text-[11px] text-[var(--text-dim)] font-mono whitespace-pre-wrap break-all leading-relaxed max-h-40 overflow-y-auto">
                  {codeText}
                </pre>
                <button
                  onClick={() => void copy(tab)}
                  title={t('embedModal.copy')}
                  className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-md bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text)] transition-colors"
                >
                  {copied === tab ? <Icons.Check size={13} className="text-[var(--ok)]" /> : <Icons.Copy size={13} />}
                </button>
              </div>
            ) : (
              <div className="px-3 py-4 rounded-lg border border-dashed border-[var(--border)] text-[11.5px] text-[var(--text-faint)] text-center">
                {t('embedModal.noUrl')}
              </div>
            )}
          </div>

          {/* Where to paste (Power BI / dashboards) hint */}
          <p className="text-[11px] text-[var(--text-faint)] leading-relaxed m-0 -mt-1">
            {t('embedModal.whereHint')}{' '}
            <a
              href={`${(import.meta.env.BASE_URL ?? '/').replace(/\/$/, '')}/embed/`}
              target="_blank" rel="noopener noreferrer"
              className="text-[var(--accent-2)] hover:underline"
            >
              {t('embedModal.openBuilder')}
            </a>
          </p>

          {/* CORS / privacy note */}
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-[var(--accent)]/8 border border-[var(--accent)]/20">
            <Icons.Info size={14} className="text-[var(--accent)] shrink-0 mt-0.5" />
            <p className="text-[11px] text-[var(--text-dim)] leading-relaxed m-0">
              {t('embedModal.corsNote')}
            </p>
          </div>
        </div>
    </Modal>
  )
}

// ── Small helpers ───────────────────────────────────────────────────────────

function CheckRow({
  checked, onChange, label,
}: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer select-none">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={[
          'w-4 h-4 rounded-[5px] border flex items-center justify-center transition-colors shrink-0',
          checked ? 'bg-[var(--accent)] border-[var(--accent)]' : 'border-[var(--border-strong)]',
        ].join(' ')}
      >
        {checked && <Icons.Check size={11} className="text-white" />}
      </button>
      <span className="text-[12px] text-[var(--text-dim)]">{label}</span>
    </label>
  )
}

function TabBtn({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={[
        'px-2.5 h-7 rounded-md text-[11px] font-medium transition-colors',
        active ? 'bg-[var(--surface-2)] text-[var(--text)]' : 'text-[var(--text-faint)] hover:text-[var(--text-dim)]',
      ].join(' ')}
    >
      {children}
    </button>
  )
}
