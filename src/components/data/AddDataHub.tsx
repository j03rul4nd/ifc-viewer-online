// ─── AddDataHub ───────────────────────────────────────────────────────────────
// "+ Add data": the one door for every kind of data the viewer takes besides
// the IFC's own Open button. A Modal (a bottom sheet on phones, via .m-sheet):
// a one-shot chooser that closes itself on every action and hands off to a
// panel, the IFC review or the scene opener. docs/ADD_DATA.md.
//
// What it does NOT do: load anything itself. A pick goes back to App
// (onPick), which routes it through the same planner as a drop — so duplicate
// detection and "scans wait for the IFC review" hold for both.

import React, { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '../Modal'
import * as Icons from '../Icons'
import { useSceneContent } from '../../hooks/useSceneContent'
import { useTwinDeviceStore } from '../../stores/twinDeviceStore'
import { isPointCloudEnabled } from '../../lib/pointcloud/pc-flag'
import { isVideoEnabled } from '../../lib/video/video-flag'
import { isMeshEnabled } from '../../lib/mesh/mesh-flag'
import { isGisEnabled } from '../../lib/geo/gis-flag'
import { hasFilePayload } from '../../lib/loading/drop-routing'
import {
  acceptFor, addDataCatalogue, type AddDataCard, type AddDataFlags, type AddDataKind,
} from '../../lib/loading/add-data-catalogue'
import type { DataPanelKind } from '../../lib/ui/data-panels'

export interface AddDataHubProps {
  onClose(): void
  /** Files picked (or dropped on the hub) for a card, or 'any' for the catch-all picker. */
  onPick(kind: AddDataKind | 'any', files: File[]): void
  onOpenPanel(kind: DataPanelKind): void
  onOpenSamples(kind: 'pointcloud' | 'mesh'): void
  onOpenDemos(): void
}

/** Literal keys, so tsc checks every t() call against the copy below. */
const CARD_COPY = {
  pointcloud: { title: 'addData.cards.pointcloud.title', desc: 'addData.cards.pointcloud.desc' },
  video: { title: 'addData.cards.video.title', desc: 'addData.cards.video.desc' },
  ifc: { title: 'addData.cards.ifc.title', desc: 'addData.cards.ifc.desc' },
  mesh: { title: 'addData.cards.mesh.title', desc: 'addData.cards.mesh.desc' },
  map: { title: 'addData.cards.map.title', desc: 'addData.cards.map.desc' },
  layers: { title: 'addData.cards.layers.title', desc: 'addData.cards.layers.desc' },
  devices: { title: 'addData.cards.devices.title', desc: 'addData.cards.devices.desc' },
  scene: { title: 'addData.cards.scene.title', desc: 'addData.cards.scene.desc' },
} as const satisfies Record<AddDataKind, { title: string; desc: string }>

const GROUP_COPY = {
  capture: 'addData.groups.capture',
  models: 'addData.groups.models',
  context: 'addData.groups.context',
  scenes: 'addData.groups.scenes',
} as const

const SECONDARY_COPY = {
  samples: 'addData.action.samples',
  liveAndDemo: 'addData.action.liveAndDemo',
  sources: 'addData.action.sources',
  demos: 'demo',
} as const

/** One glyph per data concept (scripts/icon-vocabulary.test.ts). */
const CARD_ICON: Record<AddDataKind, (p: { size?: number }) => React.ReactElement> = {
  pointcloud: Icons.PointCloud,
  video: Icons.Video,
  ifc: Icons.FileIfc,
  mesh: Icons.Mesh,
  map: Icons.Globe,
  layers: Icons.DataLayers,
  devices: Icons.Devices,
  scene: Icons.Globe,
}

const PRIMARY_BTN = 'inline-flex items-center justify-center gap-1.5 h-8 max-md:h-11 px-3 rounded-[7px] text-[12px] max-md:text-[13.5px] font-medium border border-[var(--accent)]/60 text-[var(--accent-2)] hover:bg-[var(--accent)]/10 disabled:opacity-45 disabled:hover:bg-transparent disabled:cursor-not-allowed'
const GHOST_BTN = 'inline-flex items-center justify-center h-8 max-md:h-11 px-2.5 rounded-[7px] text-[12px] max-md:text-[13.5px] text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface-2)]'

export default function AddDataHub({ onClose, onPick, onOpenPanel, onOpenSamples, onOpenDemos }: AddDataHubProps) {
  const { t } = useTranslation('toolbar')
  const flags = useMemo<AddDataFlags>(() => ({
    pointcloud: isPointCloudEnabled(),
    video: isVideoEnabled(),
    mesh: isMeshEnabled(),
    gis: isGisEnabled(),
  }), [])
  const cards = useMemo(() => addDataCatalogue(flags), [flags])
  const content = useSceneContent()
  const deviceCount = useTwinDeviceStore((s) => s.sources.length)

  // One hidden input for every picker: accept and multiple are set per pick,
  // and click() is called synchronously inside the user's click.
  const inputRef = useRef<HTMLInputElement>(null)
  const pendingKindRef = useRef<AddDataKind | 'any'>('any')
  const pick = (kind: AddDataKind | 'any'): void => {
    const input = inputRef.current
    if (!input) return
    pendingKindRef.current = kind
    input.accept = acceptFor(kind, flags)
    input.multiple = kind !== 'scene'
    input.click()
  }

  const [dragOver, setDragOver] = useState(false)

  const countOf = (kind: AddDataKind): number => {
    switch (kind) {
      case 'pointcloud': return content.clouds
      case 'video': return content.videos
      case 'mesh': return content.meshes
      case 'layers': return content.layers
      case 'devices': return deviceCount
      default: return 0
    }
  }

  const primaryLabel = (card: AddDataCard): string => {
    switch (card.primary) {
      case 'browse': return t('addData.chooseFiles')
      case 'browseOne': return t('addData.chooseFile')
      case 'setUpMap': return t('addData.action.setUpMap')
      case 'connect': return t('addData.action.connect')
    }
  }

  const onPrimary = (card: AddDataCard): void => {
    if (card.primary === 'browse' || card.primary === 'browseOne') pick(card.kind)
    else if (card.panel) onOpenPanel(card.panel)
  }

  const onSecondary = (card: AddDataCard): void => {
    switch (card.secondary) {
      case 'samples':
        if (card.kind === 'pointcloud' || card.kind === 'mesh') onOpenSamples(card.kind)
        return
      case 'demos': onOpenDemos(); return
      case 'liveAndDemo':
      case 'sources':
        if (card.panel) onOpenPanel(card.panel)
        return
    }
  }

  return (
    <Modal open onClose={onClose} title={t('addData.title')} description={t('addData.description')} size="lg">
      <div data-testid="add-data-hub" className="p-4 flex flex-col gap-4">
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.currentTarget.files ?? [])
            e.currentTarget.value = ''
            if (files.length > 0) onPick(pendingKindRef.current, files)
          }}
        />

        {/* Desktop: a drop zone. Its drop is handled here (preventDefault), so
            the window-level drop handler skips it. */}
        <div
          data-testid="add-data-dropzone"
          onDragEnter={(e) => { if (hasFilePayload(e.dataTransfer)) setDragOver(true) }}
          onDragOver={(e) => { if (hasFilePayload(e.dataTransfer)) { e.preventDefault(); setDragOver(true) } }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false) }}
          onDrop={(e) => {
            if (!hasFilePayload(e.dataTransfer)) return
            e.preventDefault()
            e.stopPropagation()
            setDragOver(false)
            const files = Array.from(e.dataTransfer.files)
            if (files.length > 0) onPick('any', files)
          }}
          className={[
            'hidden md:flex items-center gap-3 h-[88px] px-4 rounded-[10px] border-2 border-dashed transition-colors',
            dragOver ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--border-strong)]',
          ].join(' ')}
        >
          <Icons.Upload size={22} className="text-[var(--text-faint)] shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-[var(--text)]">{t('addData.dropTitle')}</div>
            <div className="text-[11.5px] text-[var(--text-dim)] leading-snug">{t('addData.dropHint')}</div>
          </div>
          <button type="button" onClick={() => pick('any')} className={PRIMARY_BTN}>
            {t('addData.chooseFiles')}
          </button>
        </div>

        {/* Phones: no drag and drop, one big picker. */}
        <button
          type="button"
          onClick={() => pick('any')}
          className="md:hidden w-full h-11 rounded-[10px] text-[13.5px] font-semibold bg-[var(--accent)] text-white inline-flex items-center justify-center gap-2"
        >
          <Icons.Upload size={16} />
          {t('addData.chooseFiles')}
        </button>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {cards.map((card) => {
            const Glyph = CARD_ICON[card.kind]
            const count = countOf(card.kind)
            const blocked = card.needsModel && content.models === 0
            const panel = card.panel
            return (
              <article
                key={card.kind}
                data-testid={`add-data-card-${card.kind}`}
                className="flex flex-col gap-2 p-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)]/40"
              >
                <div className="text-[10px] uppercase tracking-[0.08em] font-semibold text-[var(--text-faint)]">
                  {t(GROUP_COPY[card.group])}
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="w-8 h-8 shrink-0 rounded-[8px] bg-[var(--surface-2)] border border-[var(--border)] flex items-center justify-center text-[var(--accent-2)]">
                    <Glyph size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[13px] font-semibold text-[var(--text)]">{t(CARD_COPY[card.kind].title)}</h3>
                    <p className="text-[11.5px] text-[var(--text-dim)] leading-snug mt-0.5">{t(CARD_COPY[card.kind].desc)}</p>
                    {card.formats.length > 0 && (
                      <p className="font-mono text-[10.5px] text-[var(--text-faint)] mt-1 break-words">{card.formats.join(' · ')}</p>
                    )}
                    {card.kind === 'pointcloud' && (
                      <p className="text-[11px] text-[var(--text-faint)] mt-1">{t('addData.pointcloudNote')}</p>
                    )}
                    {blocked && (
                      <p className="text-[11px] text-[var(--warn)] mt-1">{t('addData.needsModel')}</p>
                    )}
                  </div>
                </div>
                <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
                  <button type="button" disabled={blocked} onClick={() => onPrimary(card)} className={PRIMARY_BTN}>
                    {primaryLabel(card)}
                  </button>
                  {card.secondary && (
                    <button type="button" onClick={() => onSecondary(card)} className={GHOST_BTN}>
                      {t(SECONDARY_COPY[card.secondary])}
                    </button>
                  )}
                </div>
                {count > 0 && panel && (
                  <button
                    type="button"
                    onClick={() => onOpenPanel(panel)}
                    className="self-start text-[11.5px] max-md:min-h-[44px] text-[var(--accent-2)] hover:underline"
                  >
                    {t('addData.inScene', { count })} · {t('addData.action.openPanel')}
                  </button>
                )}
              </article>
            )
          })}
        </div>
      </div>
    </Modal>
  )
}
