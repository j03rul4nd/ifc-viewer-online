// ─── MobileElementCard ────────────────────────────────────────────────────────
// What a phone shows about the element you tapped.
//
// Selecting used to throw the whole Properties sidebar over the model on every
// tap: the thing just picked disappeared behind a wall of property sets, and
// tapping around the model to look at things meant closing it every time.
//
// The flow is now in two steps, the way Maps does a pin:
//   1. Tap an element → the selection bar (name, type, storey, the four verbs).
//      The model stays in view; keep tapping to look around.
//   2. Tap the bar → this card, at half height: the actions, then what people
//      look a BIM element up for — GlobalId (copyable), type, storey,
//      material, the measured quantities, the type's common properties.
//      Drag up for the rest; "All properties" opens the full inspector.
//
// Tapping another element while the card is open re-targets it in place.
// Accessible by construction: an h2 for the name, a <dl> for the data, every
// control a labelled button, and the sheet gets focus when it opens so
// VoiceOver reads it.

import { TwinLiveSection } from '../TwinLiveSection'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MobileSheet } from './MobileSheet'
import * as Icons from '../Icons'
import { haptic } from '../../lib/haptics'
import type { SelectedInfo } from '../../types'
import type { ViewerAPI, IFCItemData } from '../../lib/viewer'

interface MobileElementCardProps {
  open: boolean
  selected: SelectedInfo | null
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
  onClose: () => void
  onFrame: (expressId: number, modelId?: string) => void
  onIsolate: (expressId: number, modelId?: string) => void
  onHide: (expressId: number, modelId: string) => void
  onIsolateCategory: (type: string) => void
  onReveal: (expressId: number, modelId?: string) => void
  onAllProperties: () => void
}

const TAP = { WebkitTapHighlightColor: 'transparent' } as const
const QTY_UNIT: Record<string, string> = { Length: 'm', Area: 'm²', Volume: 'm³', Weight: 'kg', Count: '', Time: 's', Unknown: '' }

function prettyType(raw: string): string {
  const noPrefix = raw.startsWith('IFC') || raw.startsWith('Ifc') ? raw.slice(3) : raw
  return noPrefix.charAt(0).toUpperCase() + noPrefix.slice(1).toLowerCase()
}

function fmtValue(v: string | number | boolean | null, locale: string): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? '✓' : '✗'
  if (typeof v === 'number') return v.toLocaleString(locale, { maximumFractionDigits: 3 })
  return String(v)
}

function Action({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => { haptic('tick'); onClick() }}
      className="flex flex-col items-center gap-1.5 min-w-0 py-2 rounded-[14px] bg-white/[0.05] text-[var(--text)] active:scale-[0.95] transition-transform"
      style={TAP}
    >
      <span aria-hidden="true" className="h-[22px] flex items-center">{children}</span>
      <span className="text-[11px] leading-tight text-center text-[var(--text-dim)] px-1 line-clamp-2">{label}</span>
    </button>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 border-b border-[var(--border)] last:border-b-0">
      <dt className="text-[13px] text-[var(--text-faint)] shrink-0">{label}</dt>
      <dd className="text-[13.5px] text-[var(--text)] text-right min-w-0 break-words">{children}</dd>
    </div>
  )
}

export function MobileElementCard({
  open, selected, viewerApiRef, onClose,
  onFrame, onIsolate, onHide, onIsolateCategory, onReveal, onAllProperties,
}: MobileElementCardProps) {
  const { t, i18n } = useTranslation('viewer')
  const locale = i18n.language || 'en'
  const [data, setData] = useState<IFCItemData | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')
  const [copied, setCopied] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)

  const id = selected ? parseInt(selected.id, 10) : NaN
  const modelId = selected?.modelId

  // Fetch the element's IFC data whenever the card targets a new element.
  useEffect(() => {
    if (!open || !selected || !Number.isFinite(id)) { setStatus('idle'); return }
    let cancelled = false
    setStatus('loading')
    setCopied(false)
    viewerApiRef.current?.getItemData(id, modelId ?? undefined)
      .then((d) => { if (!cancelled) { setData(d); setStatus(d ? 'loaded' : 'error') } })
      .catch(() => { if (!cancelled) setStatus('error') })
    return () => { cancelled = true }
  }, [open, id, modelId, selected, viewerApiRef])

  // VoiceOver: move focus into the card when it opens or re-targets, so the
  // element's name is what gets read next.
  useEffect(() => {
    if (!open) return
    const h = setTimeout(() => headingRef.current?.focus({ preventScroll: true }), 120)
    return () => clearTimeout(h)
  }, [open, id])

  const quantities = useMemo(() => {
    if (!data) return []
    const rows: Array<{ name: string; value: string }> = []
    for (const set of data.quantitySets) {
      for (const q of set.quantities) {
        if (q.value === null || !['Length', 'Area', 'Volume', 'Weight', 'Count'].includes(q.quantityType)) continue
        if (rows.some((r) => r.name === q.name)) continue
        const unit = QTY_UNIT[q.quantityType] ?? ''
        rows.push({ name: q.name, value: `${q.value.toLocaleString(locale, { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ''}` })
        if (rows.length >= 6) return rows
      }
    }
    return rows
  }, [data, locale])

  const common = useMemo(() => {
    if (!data) return []
    const sets = [...data.propertySets, ...data.typeProperties]
    const pset = sets.find((s) => /Common$/i.test(s.name)) ?? null
    return pset ? pset.properties.filter((p) => p.value !== null && p.value !== '').slice(0, 8) : []
  }, [data])

  if (!selected) return null
  const type = prettyType(selected.type)
  // The selection label is generic ("Members #54811"); once the IFC data is in,
  // the element's own Name ("Shading Fin South 03 - Tier B") is what to show.
  const title = (status === 'loaded' && data?.name) || selected.name || type
  const subtitle = status === 'loaded' && data ? (data.longName || data.description) : null

  const copyGlobalId = (): void => {
    if (!data?.globalId) return
    navigator.clipboard.writeText(data.globalId).then(() => { haptic('success'); setCopied(true) }).catch(() => {})
  }

  return (
    <MobileSheet open={open} onClose={onClose} label={title} snapPoints={[0.46, 0.92]} detentIndex={0}>
      <div className="flex flex-col min-h-0 h-full">
        {/* Header */}
        <div className="shrink-0 flex items-start gap-2 pl-4 pr-2 pb-2">
          <div className="flex-1 min-w-0">
            <span className="inline-block mb-1 px-2 py-0.5 rounded-full bg-[rgba(94,106,210,0.16)] text-[11px] font-semibold text-[var(--accent-2)] uppercase tracking-wide">
              {type}
            </span>
            <h2 ref={headingRef} tabIndex={-1} className="text-[17px] font-semibold text-[var(--text)] leading-snug break-words outline-none">
              {title}
            </h2>
            {subtitle && <p className="text-[13px] text-[var(--text-dim)] mt-0.5 leading-snug">{subtitle}</p>}
            {selected.storey && <p className="text-[12.5px] text-[var(--text-faint)] mt-0.5">{selected.storey}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('elementCard.close')}
            className="w-10 h-10 shrink-0 rounded-[11px] bg-white/[0.05] text-[var(--text-dim)] flex items-center justify-center"
            style={TAP}
          >
            <Icons.X size={15} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-3">
          {/* Actions */}
          <div className="grid grid-cols-5 gap-1.5 mb-4" role="group" aria-label={t('elementCard.more')}>
            <Action label={t('contextMenu.frame')} onClick={() => onFrame(id, modelId)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.2-4.2M11 8v6M8 11h6" /></svg>
            </Action>
            <Action label={t('contextMenu.isolateElement')} onClick={() => onIsolate(id, modelId)}><Icons.Isolate size={20} /></Action>
            <Action label={t('contextMenu.hide')} onClick={() => { onHide(id, modelId ?? ''); onClose() }}><Icons.EyeOff size={20} /></Action>
            <Action label={t('contextMenu.isolateCategory')} onClick={() => onIsolateCategory(selected.type)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" opacity=".35" /></svg>
            </Action>
            <Action label={t('contextMenu.revealInTree')} onClick={() => onReveal(id, modelId)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 5h6M8 12h6M8 19h6M6 5v14h2M6 12h2" /></svg>
            </Action>
          </div>

          {/* Live data: the devices bound to this element (operational twin). Renders nothing otherwise. */}
          <div className="mb-3 rounded-[14px] overflow-hidden border border-[var(--border)] empty:hidden">
            <TwinLiveSection globalId={data?.globalId} modelId={modelId} expressId={Number.isFinite(id) ? id : null} />
          </div>

          {/* Key data */}
          <h3 className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)] mb-1">{t('elementCard.keyData')}</h3>
          {status === 'loading' && <p className="text-[13px] text-[var(--text-faint)] py-3" role="status">{t('elementCard.loading')}</p>}
          {status === 'error' && <p className="text-[13px] text-[var(--text-faint)] py-3">{t('elementCard.noData')}</p>}
          {status === 'loaded' && data && (
            <>
              <dl className="rounded-[14px] bg-white/[0.03] border border-[var(--border)] px-3 mb-4">
                {data.globalId && (
                  <Row label="GlobalId">
                    <button
                      type="button"
                      onClick={copyGlobalId}
                      aria-label={`${t('elementCard.copyGlobalId')}: ${data.globalId}`}
                      className="font-mono text-[12.5px] text-[var(--text)] underline decoration-dotted underline-offset-2 break-all text-right"
                      style={TAP}
                    >
                      {copied ? `✓ ${t('contextMenu.copied')}` : data.globalId}
                    </button>
                  </Row>
                )}
                {(data.typeName || data.objectType) && <Row label={t('elementCard.type')}>{data.objectType || data.typeName}</Row>}
                {(data.storey || selected.storey) && <Row label={t('elementCard.storey')}>{data.storey || selected.storey}</Row>}
                {data.materials.length > 0 && (
                  <Row label={t('elementCard.material')}>{data.materials.map((m) => m.name).filter(Boolean).join(', ')}</Row>
                )}
                {data.tag && <Row label="Tag">{data.tag}</Row>}
              </dl>

              {quantities.length > 0 && (
                <>
                  <h3 className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)] mb-1.5">{t('elementCard.quantities')}</h3>
                  <dl className="grid grid-cols-2 gap-1.5 mb-4">
                    {quantities.map((q) => (
                      <div key={q.name} className="rounded-[12px] bg-white/[0.03] border border-[var(--border)] px-3 py-2 min-w-0">
                        <dt className="text-[11.5px] text-[var(--text-faint)] truncate">{q.name}</dt>
                        <dd className="text-[15px] font-semibold font-mono tabular-nums text-[var(--text)]">{q.value}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              )}

              {common.length > 0 && (
                <>
                  <h3 className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[var(--text-faint)] mb-1">{t('elementCard.commonProps')}</h3>
                  <dl className="rounded-[14px] bg-white/[0.03] border border-[var(--border)] px-3 mb-4">
                    {common.map((p) => <Row key={p.expressId} label={p.name}>{fmtValue(p.value, locale)}</Row>)}
                  </dl>
                </>
              )}
            </>
          )}

          <button
            type="button"
            onClick={() => { haptic('tick'); onAllProperties() }}
            className="w-full h-12 rounded-[14px] bg-[var(--accent)] text-white text-[14px] font-semibold active:scale-[0.98] transition-transform"
            style={TAP}
          >
            {t('elementCard.allProperties')}
          </button>
        </div>
      </div>
    </MobileSheet>
  )
}
