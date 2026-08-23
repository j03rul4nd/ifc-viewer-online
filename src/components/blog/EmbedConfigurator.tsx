// ─── EmbedConfigurator.tsx ────────────────────────────────────────────────────
// Inline, self-contained embed builder for blog posts. A reader pastes a public
// IFC URL, tweaks the options, and gets a paste-ready <iframe> snippet plus a
// live preview rendered by EmbedViewer. Reuses the same URL helpers as the app's
// EmbedModal so the generated links stay in sync.

import React, { useState, useMemo } from 'react'
import EmbedViewer from './EmbedViewer'
import {
  buildEmbedUrl,
  buildIframeSnippet,
  isLoadableUrl,
  type EmbedUiPreset,
} from '../../lib/url-params'
import { ALL_PANEL_IDS, type PanelId } from '../../lib/ui/panel-rail'

const SAMPLE_URL = 'https://raw.githubusercontent.com/youshengCode/IfcSampleFiles/main/Ifc4_SampleHouse.ifc'

const PRESETS: { id: EmbedUiPreset; label: string; desc: string }[] = [
  { id: 'minimal', label: 'Minimal', desc: '3D + categories + score' },
  { id: 'full',    label: 'Full',    desc: 'Tree + validation panel' },
  { id: 'kiosk',   label: 'Kiosk',   desc: '3D canvas only' },
  // Shipped a while ago and never offered here, so the one preset built for a
  // non-technical audience was the one nobody could find.
  { id: 'client',  label: 'Client',  desc: 'Show-only skin for stakeholders' },
]

/**
 * The tools a reader can leave on the rail.
 *
 * Not every panel: `properties` follows the selection rather than being a tool
 * you pick, and point cloud and mesh only appear once something is loaded for
 * them to act on, so offering them in a builder for a plain IFC embed would
 * promise something the embed cannot show.
 */
const TOOLS: { id: PanelId; label: string }[] = [
  { id: 'scene',       label: 'Scene' },
  { id: 'measurement', label: 'Measure' },
  { id: 'section',     label: 'Section' },
  { id: 'plans',       label: 'Plans' },
  { id: 'map',         label: 'Map' },
  { id: 'solar',       label: 'Sun' },
]

export interface EmbedConfiguratorProps {
  title?: string
  description?: string
  /** Pre-filled IFC URL. Defaults to a small public sample. */
  defaultModelUrl?: string
  defaultFileName?: string
  defaultHeight?: number
}

export default function EmbedConfigurator({
  title = 'Build your embed',
  description = 'Paste a public IFC URL and copy the iframe — it renders entirely in the visitor’s browser.',
  defaultModelUrl = SAMPLE_URL,
  defaultFileName,
  defaultHeight = 480,
}: EmbedConfiguratorProps) {
  const [url, setUrl]                   = useState(defaultModelUrl)
  const [previewUrl, setPreviewUrl]     = useState(defaultModelUrl)
  const [preset, setPreset]             = useState<EmbedUiPreset>('minimal')
  const [autoValidate, setAutoValidate] = useState(true)
  const [openPanel, setOpenPanel]       = useState(false)
  const [accent, setAccent]             = useState('#5E6AD2')
  // null = no opinion, and the preset decides. A Set would lose that
  // distinction: "every tool" and "I have not chosen" look identical.
  const [tools, setTools]               = useState<PanelId[] | null>(null)
  const [height, setHeight]             = useState(defaultHeight)
  const [copied, setCopied]             = useState(false)

  const trimmed  = url.trim()
  const validUrl = isLoadableUrl(trimmed)
  const dirty    = trimmed !== previewUrl

  const baseUrl = useMemo(() => {
    if (typeof window === 'undefined') return '/'
    const base = import.meta.env.BASE_URL ?? '/'
    return window.location.origin + (base.endsWith('/') ? base : `${base}/`)
  }, [])

  const snippet = useMemo(() => {
    if (!validUrl) return ''
    const embedUrl = buildEmbedUrl({
      baseUrl, modelUrl: trimmed, fileName: defaultFileName,
      preset, autoValidate, openPanel,
      accent: accent.toLowerCase() !== '#5e6ad2' ? accent : undefined,
      panels: tools ?? undefined,
    })
    return buildIframeSnippet(embedUrl, { height })
  }, [validUrl, baseUrl, trimmed, defaultFileName, preset, autoValidate, openPanel, accent, height, tools])

  const copy = async (): Promise<void> => {
    if (!snippet) return
    try {
      await navigator.clipboard.writeText(snippet)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard blocked — text is selectable */ }
  }

  return (
    <div className="my-7 sm:my-10 rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-5 pt-4 pb-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-2 mb-1">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8 6l-6 6 6 6M16 6l6 6-6 6" />
          </svg>
          <h3 className="text-[15px] font-semibold text-[var(--text)] m-0">{title}</h3>
        </div>
        <p className="text-[12.5px] text-[var(--text-dim)] leading-relaxed m-0">{description}</p>
      </div>

      <div className="px-4 sm:px-5 py-4 flex flex-col gap-4">
        {/* URL input */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold text-[var(--text-dim)] uppercase tracking-wider">
            Public IFC URL
          </label>
          <div className="flex gap-2">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && validUrl) setPreviewUrl(trimmed) }}
              placeholder="https://your-cde.com/model.ifc"
              spellCheck={false}
              className="flex-1 min-w-0 px-3 h-9 rounded-lg bg-[var(--bg)] border text-[12px] text-[var(--text)] font-mono outline-none focus:border-[var(--accent)] transition-colors"
              style={{ borderColor: url && !validUrl ? 'var(--danger)' : 'var(--border)' }}
            />
            <button
              onClick={() => { if (validUrl) setPreviewUrl(trimmed) }}
              disabled={!validUrl || !dirty}
              className="px-3 h-9 rounded-lg text-[12px] font-medium whitespace-nowrap transition-colors disabled:opacity-40 border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)]/10"
            >
              Update preview
            </button>
          </div>
          <span className="text-[10.5px] text-[var(--text-faint)] leading-snug">
            The host must allow cross-origin (CORS) requests. Nothing is uploaded — the file is fetched in the visitor’s browser.
          </span>
        </div>

        {/* Tools — which panels the visitor gets.
            A preset decides the chrome; this decides the toolbox inside it, and
            the two are separate questions. Leaving every tool on is the default
            and adds no parameter, so the snippet stays short for the common
            case. */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline gap-2">
            <span className="text-[11px] font-semibold text-[var(--text-dim)] uppercase tracking-wider">Tools</span>
            {tools !== null && (
              <button
                onClick={() => setTools(null)}
                className="text-[11px] text-[var(--accent)] hover:underline"
              >
                reset
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TOOLS.map((tool) => {
              // null means "no opinion", which shows as everything on.
              const on = tools === null || tools.includes(tool.id)
              return (
                <button
                  key={tool.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    const current = tools ?? TOOLS.map((x) => x.id)
                    const next = on
                      ? current.filter((id) => id !== tool.id)
                      : [...current, tool.id]
                    // Back in rail order, so two readers who picked the same
                    // tools in a different order get the same snippet.
                    setTools(ALL_PANEL_IDS.filter((id) => next.includes(id)))
                  }}
                  className={[
                    'px-2.5 py-1 rounded-full border text-[12px] font-medium transition-colors',
                    on
                      ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text)]'
                      : 'border-[var(--border)] text-[var(--text-faint)] hover:border-[var(--text-faint)] line-through',
                  ].join(' ')}
                >
                  {tool.label}
                </button>
              )
            })}
          </div>
          <p className="text-[11.5px] text-[var(--text-dim)] leading-relaxed m-0">
            {tools !== null && tools.length === 0
              ? 'No tool rail — the viewer shows the model and nothing else.'
              : 'Turn a tool off and it is gone from the embed, not greyed out.'}
          </p>
        </div>

        {/* Options */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-4">
          <div className="flex flex-col gap-1.5 flex-1">
            <span className="text-[11px] font-semibold text-[var(--text-dim)] uppercase tracking-wider">Layout</span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPreset(p.id)}
                  title={p.desc}
                  className={[
                    'px-2 py-1.5 rounded-lg border text-[12px] font-medium transition-colors',
                    preset === p.id
                      ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text)]'
                      : 'border-[var(--border)] text-[var(--text-dim)] hover:border-[var(--text-faint)]',
                  ].join(' ')}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <Toggle checked={autoValidate} onChange={setAutoValidate} label="Validate" />
            <Toggle checked={openPanel} onChange={setOpenPanel} label="Open panel" />
            <label className="flex items-center gap-1.5">
              <span className="text-[12px] text-[var(--text-dim)]">Accent</span>
              <input
                type="color"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                className="w-9 h-8 rounded-lg bg-[var(--bg)] border border-[var(--border)] cursor-pointer p-0.5"
                title="Accent colour"
              />
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-[12px] text-[var(--text-dim)]">Height</span>
              <input
                type="number"
                min={240}
                max={2000}
                step={20}
                value={height}
                onChange={(e) => setHeight(Math.max(240, Math.min(2000, Number(e.target.value) || 480)))}
                className="w-20 px-2 h-8 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[12px] text-[var(--text)] font-mono outline-none focus:border-[var(--accent)]"
              />
            </label>
          </div>
        </div>

        {/* Generated snippet */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-[var(--text-dim)] uppercase tracking-wider">iframe snippet</span>
            {validUrl && (
              <button
                onClick={() => void copy()}
                className="flex items-center gap-1 text-[11px] text-[var(--text-dim)] hover:text-[var(--accent)] transition-colors"
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            )}
          </div>
          {validUrl ? (
            <pre className="m-0 px-3 py-2.5 rounded-lg bg-[var(--bg)] border border-[var(--border)] text-[11px] text-[var(--text-dim)] font-mono whitespace-pre-wrap break-all leading-relaxed max-h-36 overflow-y-auto">
              {snippet}
            </pre>
          ) : (
            <div className="px-3 py-3 rounded-lg border border-dashed border-[var(--border)] text-[11.5px] text-[var(--text-faint)] text-center">
              Enter a valid public IFC URL to generate the snippet.
            </div>
          )}
        </div>

        {/* Live preview */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold text-[var(--text-dim)] uppercase tracking-wider">Live preview</span>
          {isLoadableUrl(previewUrl) ? (
            <EmbedViewer
              key={previewUrl}
              modelUrl={previewUrl}
              fileName={defaultFileName}
              height={height}
              title={undefined}
            />
          ) : (
            <div className="rounded-2xl border border-dashed border-[var(--border)] py-10 text-center text-[12px] text-[var(--text-faint)]">
              No preview — set a valid URL above.
            </div>
          )}
        </div>

        {/* Where to paste */}
        <p className="text-[11px] text-[var(--text-faint)] leading-relaxed m-0">
          💡 Paste the iframe into a blog, a CDE document panel, Notion, a Power BI “Web content” visual or any dashboard. The model is parsed in the visitor’s browser — nothing is uploaded.
        </p>
      </div>
    </div>
  )
}

function Toggle({
  checked, onChange, label,
}: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-1.5 cursor-pointer select-none">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={[
          'w-4 h-4 rounded-[5px] border flex items-center justify-center transition-colors shrink-0',
          checked ? 'bg-[var(--accent)] border-[var(--accent)] text-white' : 'border-[var(--border)] text-transparent',
        ].join(' ')}
        aria-pressed={checked}
        aria-label={label}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
      </button>
      <span className="text-[12px] text-[var(--text-dim)]">{label}</span>
    </label>
  )
}
