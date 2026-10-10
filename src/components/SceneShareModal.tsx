// ─── SceneShareModal ──────────────────────────────────────────────────────────
// Share → "Digital-twin scene": the whole scene as ONE document
// (lib/scene-doc) — models by URL, data layers, live device bindings, map,
// background and the current camera — and three ways out of the browser:
//
//   • a .scene.json file, to publish on any static host and open with
//     `?scene=<url>` (the way with no size limit);
//   • a link that carries the scene in its #fragment (nothing is uploaded,
//     not even to us);
//   • an <iframe> snippet built on that link, for a web page.
//
// It also lists every source the scene reads, with its attribution — what a
// publisher needs to credit — and opens a scene file someone sent.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from './Modal'
import * as Icons from './Icons'
import type { ViewerAPI } from '../lib/viewer'
import { useSceneStore } from '../stores/sceneStore'
import { useGeoStore } from '../stores/geoStore'
import { useVectorLayerStore } from '../stores/vectorLayerStore'
import { useTwinDeviceStore } from '../stores/twinDeviceStore'
import { parseSceneDoc, sceneSources, type SceneDoc } from '../lib/scene-doc/scene-doc'
import { encodeSceneLink } from '../lib/scene-doc/scene-link'
import { appBase, sceneLink, snapshotScene } from '../lib/scene-doc/scene-snapshot'
import { buildIframeSnippet } from '../lib/url-params'
import { toast } from '../stores/toastStore'

type EmbedUi = 'full' | 'client' | 'kiosk'

interface Props {
  viewerApiRef: React.RefObject<ViewerAPI | null>
  onClose: () => void
}

const field = 'w-full px-3 h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[12px] text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors'
const label = 'text-[11px] font-semibold text-[var(--text-dim)] uppercase tracking-wider'
const btn = 'flex items-center justify-center gap-1.5 px-3 h-9 rounded-lg border border-[var(--border)] text-[12px] font-medium text-[var(--text)] hover:border-[var(--accent)] hover:bg-[var(--surface-2)] transition-colors disabled:opacity-40'

export default function SceneShareModal({ viewerApiRef, onClose }: Props) {
  const { t: tRaw } = useTranslation('layers')
  const t = tRaw as unknown as (k: string, o?: Record<string, unknown>) => string
  const models = useSceneStore((s) => s.models)
  const layerCount = useVectorLayerStore((s) => s.layers.length)
  const bindingCount = useTwinDeviceStore((s) => s.bindings.length)
  const mapMode = useGeoStore((s) => s.mapMode)
  const [title, setTitle] = useState(() => models[0]?.fileName.replace(/\.ifc$/i, '') ?? '')
  const [description, setDescription] = useState('')
  const [withCamera, setWithCamera] = useState(true)
  const [ui, setUi] = useState<EmbedUi>('client')
  const [doc, setDoc] = useState<SceneDoc | null>(null)
  const [stats, setStats] = useState<{ local: number; secrets: number } | null>(null)
  const [link, setLink] = useState<string | null | undefined>(undefined)
  const [copied, setCopied] = useState<'link' | 'iframe' | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Re-assembled whenever an input changes: cheap, and the preview of sources
  // and the link always describe what would be shared right now.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const snap = await snapshotScene({
        title: title.trim() || t('scene.untitled'),
        description: description.trim() || undefined,
        camera: withCamera ? viewerApiRef.current?.getCameraViewpoint() ?? null : null,
      })
      const next = await sceneLink(snap.doc)
      if (cancelled) return
      setDoc(snap.doc)
      setStats({ local: snap.localModels, secrets: snap.secretsRemoved })
      setLink(next)
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, withCamera, models.length, layerCount, bindingCount, mapMode])

  const sources = useMemo(() => (doc ? sceneSources(doc) : []), [doc])
  const embedLink = link ? link.replace('#scene=', `?ui=${ui}#scene=`) : null
  const snippet = embedLink ? buildIframeSnippet(embedLink, { height: 600 }) : ''
  const empty = !!doc && doc.models.length === 0 && doc.layers.length === 0

  const copy = async (which: 'link' | 'iframe'): Promise<void> => {
    const text = which === 'link' ? link : snippet
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(which)
      setTimeout(() => setCopied(null), 1500)
    } catch { /* clipboard blocked: the text stays selectable below */ }
  }

  const download = (): void => {
    if (!doc) return
    const slug = (doc.meta.title || 'scene').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'scene'
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${slug}.scene.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }

  // Opening a scene = reloading the viewer on it: the same path a shared link
  // takes, so a file and a link can never behave differently.
  const open = async (file: File): Promise<void> => {
    const v = parseSceneDoc(await file.text())
    if (!v.ok) { toast(v.errors.join(' '), 'error'); return }
    const packed = await encodeSceneLink(v.doc)
    if (!packed) { toast(t('scene.tooBigToOpen'), 'error'); return }
    const next = new URL(`${appBase()}#scene=${packed}`)
    const sameDocument = next.pathname === window.location.pathname && next.search === window.location.search
    window.location.assign(next.toString())
    // Only the fragment changed: assigning it does not reload by itself.
    if (sameDocument) window.location.reload()
  }

  const row = (k: string, v: React.ReactNode) => (
    <div className="flex items-baseline justify-between gap-3 text-[12px]">
      <span className="text-[var(--text-dim)]">{k}</span>
      <span className="text-[var(--text)] text-right">{v}</span>
    </div>
  )

  return (
    <Modal open onClose={onClose} title={t('scene.title')} size="md">
      <div className="overflow-y-auto flex-1 px-4 py-4 flex flex-col gap-4" data-testid="scene-share">
        <p className="text-[12px] text-[var(--text-dim)] leading-relaxed">{t('scene.intro')}</p>

        <label className="flex flex-col gap-1.5">
          <span className={label}>{t('scene.name')}</span>
          <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={label}>{t('scene.description')}</span>
          <textarea className={`${field} h-16 py-2 resize-none`} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={600} />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className={label}>{t('scene.contents')}</span>
          {row(t('scene.models'), doc ? doc.models.length : '…')}
          {stats && stats.local > 0 && (
            <div className="text-[10.5px] text-[#f5a524] leading-snug">{t('scene.localModels', { n: stats.local })}</div>
          )}
          {row(t('scene.layers'), layerCount)}
          {row(t('scene.devices'), bindingCount)}
          {row(t('scene.map'), doc?.view.map ?? t('scene.off'))}
          <label className="flex items-center gap-2 text-[12px] text-[var(--text-dim)] cursor-pointer select-none">
            <input type="checkbox" checked={withCamera} onChange={(e) => setWithCamera(e.target.checked)} />
            {t('scene.keepCamera')}
          </label>
          {stats && stats.secrets > 0 && (
            <div className="text-[10.5px] text-[var(--text-faint)] leading-snug">{t('scene.secretsRemoved', { n: stats.secrets })}</div>
          )}
        </div>

        {empty ? (
          <div className="text-[12px] text-[#f5a524]">{t('scene.empty')}</div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <button className={btn} onClick={download} disabled={!doc} data-testid="scene-download">
                <Icons.Download size={14} /> {t('scene.download')}
              </button>
              <button className={btn} onClick={() => void copy('link')} disabled={!link} data-testid="scene-copy-link">
                <Icons.Link size={14} /> {copied === 'link' ? t('scene.copied') : t('scene.copyLink')}
              </button>
            </div>
            {link === null && <div className="text-[10.5px] text-[#f5a524] leading-snug">{t('scene.tooBigForLink')}</div>}

            <div className="flex flex-col gap-1.5">
              <span className={label}>{t('scene.embed')}</span>
              <div className="flex gap-1.5">
                {(['client', 'full', 'kiosk'] as const).map((u) => (
                  <button key={u} onClick={() => setUi(u)}
                    className={`px-2.5 h-8 rounded-lg border text-[11px] ${ui === u ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text)]' : 'border-[var(--border)] text-[var(--text-dim)]'}`}>
                    {t(`scene.ui.${u}`)}
                  </button>
                ))}
              </div>
              <textarea readOnly value={snippet} className={`${field} h-24 py-2 font-mono text-[10.5px] resize-none`} onFocus={(e) => e.currentTarget.select()} />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10.5px] text-[var(--text-faint)] leading-snug">{t('scene.hostHint')}</span>
                <button className={btn} onClick={() => void copy('iframe')} disabled={!snippet}>
                  {copied === 'iframe' ? t('scene.copied') : t('scene.copyIframe')}
                </button>
              </div>
            </div>
          </>
        )}

        {sources.length > 0 && (
          <details>
            <summary className="cursor-pointer select-none text-[12px] text-[var(--text-dim)]">{t('scene.sources', { n: sources.length })}</summary>
            <ul className="mt-2 flex flex-col gap-1.5" data-testid="scene-sources">
              {sources.map((s, i) => (
                <li key={`${s.url}-${i}`} className="text-[11px] leading-snug">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[var(--text)]">{s.name}</span>
                    {s.live && <span className="px-1 rounded text-[8px] font-semibold bg-[#22c55e]/15 text-[#22c55e]">{t('scene.live')}</span>}
                  </div>
                  <div className="text-[var(--text-faint)] font-mono break-all">{(() => { try { return new URL(s.url, window.location.href).host } catch { return s.url } })()}</div>
                  {s.attribution && <div className="text-[var(--text-dim)]">{s.attribution}</div>}
                </li>
              ))}
            </ul>
          </details>
        )}

        <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between gap-2">
          <span className="text-[11px] text-[var(--text-faint)]">{t('scene.openHint')}</span>
          <button className={btn} onClick={() => fileRef.current?.click()}>{t('scene.open')}</button>
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void open(f); e.currentTarget.value = '' }} />
        </div>
      </div>
    </Modal>
  )
}
