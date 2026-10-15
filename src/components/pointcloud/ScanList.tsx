// ─── ScanList ─────────────────────────────────────────────────────────────────
// The point cloud panel's list of scans: real selection (click, Ctrl/⌘, Shift,
// checkbox column, select-all), a bulk bar for the selection, inline rename,
// identity swatches, per-row health and a Locate flash.
//
// Each row subscribes to its OWN entry, so a streamed chunk re-renders that row
// and the header total, not the list. Confirms and the topic picker render in
// the panel flow: a Modal would close this panel (pushModal closes floating
// panels).
//
// Escape layering: Esc in the list clears the selection and stops there; with
// nothing to clear it falls through to the panel registry, which closes the
// panel. A rename input's Esc cancels the rename only.

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import {
  usePointCloudStore, selectCloudById, selectTotalPoints, cloudLabel,
} from '../../stores/pointCloudStore'
import { useTopicStore } from '../../stores/topicStore'
import { modeFromEvent } from '../../lib/selection'
import { itemKey, membershipState, topicsOf, MAX_TOPICS } from '../../lib/topics'
import { hexColor } from '../../lib/pointcloud/pc-style'
import { RowIcon, SectionTitle, SmallButton, formatCount } from './pc-ui'

export interface ScanListProps {
  describeError: (key: string | null | undefined) => string
  issueCountById: Record<string, number>
  onVisible: (ids: string[], visible: boolean) => void
  onSolo: (ids: string[]) => void
  onFrame: (ids: string[]) => void
  onLocate: (id: string) => void
  onRemove: (ids: string[]) => void
}

const isTextField = (el: EventTarget | null): boolean =>
  el instanceof HTMLElement && (el.tagName === 'INPUT' && (el as HTMLInputElement).type !== 'checkbox' || el.tagName === 'TEXTAREA' || el.isContentEditable)

export function ScanList({ describeError, issueCountById, onVisible, onSolo, onFrame, onLocate, onRemove }: ScanListProps) {
  const { t } = useTranslation('pointcloud')
  const ids = usePointCloudStore(useShallow((s) => s.clouds.map((c) => c.id)))
  const selected = usePointCloudStore(useShallow((s) => s.selectedCloudIds))
  const total = usePointCloudStore(selectTotalPoints)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [topicOpen, setTopicOpen] = useState(false)
  const selectAllRef = useRef<HTMLInputElement>(null)
  const multi = ids.length >= 2
  const allSelected = multi && selected.length === ids.length
  const someSelected = selected.length > 0 && !allSelected

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected
  }, [someSelected])
  // A bulk confirm or picker belongs to the selection it was opened for.
  useEffect(() => { if (selected.length === 0) { setConfirmRemove(false); setTopicOpen(false) } }, [selected.length])

  const onKeyDown = (e: React.KeyboardEvent): void => {
    const store = usePointCloudStore.getState()
    if (isTextField(e.target)) return
    if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault()
      store.selectClouds(store.clouds.map((c) => c.id))
      return
    }
    if (e.key === 'Escape') {
      if (confirmRemove || topicOpen) { e.preventDefault(); setConfirmRemove(false); setTopicOpen(false); return }
      if (store.selectedCloudIds.length > 0) { e.preventDefault(); store.clearSelection() }
      return
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && store.selectedCloudIds.length > 0) {
      e.preventDefault()
      setConfirmRemove(true)
      return
    }
    if (e.key === 'F2' && store.selectedCloudIds.length === 1) {
      e.preventDefault()
      setRenamingId(store.selectedCloudIds[0])
    }
  }

  const selectedKeys = usePointCloudStore(useShallow((s) =>
    s.clouds.filter((c) => s.selectedCloudIds.includes(c.id)).map((c) => itemKey('cloud', c.fileKey))))

  return (
    <div
      data-testid="pc-scan-list"
      role="listbox"
      aria-multiselectable="true"
      aria-label={t('ui.loaded')}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="flex flex-col gap-1.5 outline-none"
    >
      <div className="flex items-center gap-2">
        {multi && (
          <label className="flex items-center justify-center w-5 h-5 max-md:w-11 max-md:h-11 -ml-0.5 cursor-pointer" title={t('list.selectAll')}>
            <input
              ref={selectAllRef}
              type="checkbox"
              data-testid="pc-select-all"
              aria-label={t('list.selectAll')}
              checked={allSelected}
              onChange={() => {
                const store = usePointCloudStore.getState()
                if (allSelected) store.clearSelection()
                else store.selectClouds(store.clouds.map((c) => c.id))
              }}
              className="accent-[var(--accent)] cursor-pointer"
            />
          </label>
        )}
        <div className="flex-1"><SectionTitle>{t('ui.loaded')}</SectionTitle></div>
        {total > 0 && (
          <span className="text-[11px] font-mono text-[var(--text-faint)]">
            {t('status.points', { count: formatCount(total) })}
          </span>
        )}
      </div>
      {multi && selected.length === 0 && <div className="text-[11px] text-[var(--text-faint)]">{t('list.hint')}</div>}

      {selected.length > 0 && (
        <BulkBar
          count={selected.length}
          onShow={() => onVisible(selected, true)}
          onHide={() => onVisible(selected, false)}
          onSolo={() => onSolo(selected)}
          onFrame={() => onFrame(selected)}
          onTopic={() => { setTopicOpen((v) => !v); setConfirmRemove(false) }}
          topicOpen={topicOpen}
          onRename={selected.length === 1 ? () => setRenamingId(selected[0]) : null}
          onRemove={() => { setConfirmRemove(true); setTopicOpen(false) }}
          onClear={() => usePointCloudStore.getState().clearSelection()}
        />
      )}

      {topicOpen && selected.length > 0 && <TopicAssign keys={selectedKeys} />}

      {confirmRemove && selected.length > 0 && (
        <div data-testid="pc-remove-confirm" role="alert"
          className="rounded-[10px] border border-[#E5484D55] bg-[#E5484D12] px-3 py-2 flex flex-col gap-2">
          <div className="text-[12px] leading-snug text-[var(--text)]">{t('bulk.removeConfirm', { count: selected.length })}</div>
          <div className="flex gap-1.5">
            <button
              type="button"
              data-testid="pc-remove-yes"
              onClick={() => { const ids2 = [...selected]; setConfirmRemove(false); onRemove(ids2) }}
              className="flex-1 px-3 py-1.5 max-md:min-h-[44px] rounded-[8px] text-[12px] font-semibold bg-[#E5484D] text-white hover:brightness-110"
            >
              {t('bulk.removeYes')}
            </button>
            <SmallButton testId="pc-remove-keep" onClick={() => setConfirmRemove(false)}>{t('bulk.keep')}</SmallButton>
          </div>
        </div>
      )}

      {ids.map((id) => (
        <ScanRow
          key={id}
          id={id}
          multi={multi}
          selected={selected.includes(id)}
          issueCount={issueCountById[id] ?? 0}
          renaming={renamingId === id}
          onRenameStart={setRenamingId}
          onRenameEnd={() => setRenamingId(null)}
          describeError={describeError}
          onVisible={onVisible}
          onLocate={onLocate}
          onRemove={onRemove}
        />
      ))}
    </div>
  )
}

function BulkBar({ count, onShow, onHide, onSolo, onFrame, onTopic, topicOpen, onRename, onRemove, onClear }: {
  count: number
  onShow: () => void; onHide: () => void; onSolo: () => void; onFrame: () => void
  onTopic: () => void; topicOpen: boolean; onRename: (() => void) | null; onRemove: () => void; onClear: () => void
}) {
  const { t } = useTranslation('pointcloud')
  const btn = 'px-2 py-1 max-md:min-h-[40px] max-md:px-2.5 rounded-[7px] text-[11.5px] font-medium text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--surface)] transition-colors whitespace-nowrap'
  return (
    <div data-testid="pc-bulk-bar"
      className="flex flex-wrap items-center gap-0.5 rounded-[10px] border border-[var(--accent)] bg-[var(--surface-2)] px-1.5 py-1">
      <span className="px-1.5 text-[11.5px] font-semibold text-[var(--text)] whitespace-nowrap">{t('bulk.selected', { count })}</span>
      <button type="button" className={btn} data-testid="pc-bulk-show" onClick={onShow}>{t('bulk.show')}</button>
      <button type="button" className={btn} data-testid="pc-bulk-hide" onClick={onHide}>{t('bulk.hide')}</button>
      <button type="button" className={btn} data-testid="pc-bulk-solo" title={t('bulk.soloHint')} onClick={onSolo}>{t('bulk.solo')}</button>
      <button type="button" className={btn} data-testid="pc-bulk-frame" onClick={onFrame}>{t('bulk.frame')}</button>
      <button type="button" className={btn} data-testid="pc-bulk-topic" aria-expanded={topicOpen} onClick={onTopic}>{t('bulk.topic')}</button>
      {onRename && <button type="button" className={btn} data-testid="pc-bulk-rename" onClick={onRename}>{t('bulk.rename')}</button>}
      <button type="button" className={`${btn} hover:!text-[#E5484D]`} data-testid="pc-bulk-remove" onClick={onRemove}>{t('bulk.remove')}</button>
      <span className="flex-1" />
      <RowIcon label={t('bulk.clear')} onClick={onClear}><path d="M3 3l8 8M11 3L3 11" /></RowIcon>
    </div>
  )
}

/** Tri-state topic membership for the selected scans, plus 'new from selection'. */
function TopicAssign({ keys }: { keys: string[] }) {
  const { t } = useTranslation('pointcloud')
  const topics = useTopicStore((s) => s.topics)
  const members = useTopicStore((s) => s.members)
  const state = useMemo(() => ({ topics, members }), [topics, members])
  return (
    <div data-testid="pc-topic-assign" className="rounded-[10px] border border-[var(--border)] px-3 py-2 flex flex-col gap-1.5">
      <div className="text-[11.5px] font-semibold text-[var(--text-dim)]">{t('topics.assignTitle')}</div>
      {topics.map((topic) => {
        const m = membershipState(state, keys, topic.id)
        return (
          <label key={topic.id} className="flex items-center gap-2 text-[12px] text-[var(--text)] cursor-pointer max-md:min-h-[40px]">
            <input
              type="checkbox"
              checked={m === 'all'}
              ref={(el) => { if (el) el.indeterminate = m === 'some' }}
              onChange={() => useTopicStore.getState().setMembership(keys, topic.id, m !== 'all')}
              className="accent-[var(--accent)]"
            />
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: hexColor(topic.color) }} />
            <span className="truncate">{topic.name}</span>
          </label>
        )
      })}
      {topics.length >= MAX_TOPICS
        ? <div className="text-[11px] text-[var(--text-faint)]">{t('topics.limit', { max: MAX_TOPICS })}</div>
        : (
          <button
            type="button"
            onClick={() => useTopicStore.getState().createTopic({ name: t('topics.defaultName', { n: topics.length + 1 }) }, keys)}
            className="self-start text-[12px] font-medium text-[var(--accent)] hover:underline underline-offset-2 max-md:min-h-[40px]"
          >
            + {t('topics.newFromSelection')}
          </button>
        )}
    </div>
  )
}

interface ScanRowProps {
  id: string
  multi: boolean
  selected: boolean
  issueCount: number
  renaming: boolean
  onRenameStart: (id: string) => void
  onRenameEnd: () => void
  describeError: (key: string | null | undefined) => string
  onVisible: (ids: string[], visible: boolean) => void
  onLocate: (id: string) => void
  onRemove: (ids: string[]) => void
}

const ScanRow = memo(function ScanRow({
  id, multi, selected, issueCount, renaming, onRenameStart, onRenameEnd, describeError, onVisible, onLocate, onRemove,
}: ScanRowProps) {
  const { t } = useTranslation('pointcloud')
  const selector = useMemo(() => selectCloudById(id), [id])
  const cloud = usePointCloudStore(selector)
  const topicState = useTopicStore(useShallow((s) => ({ topics: s.topics, members: s.members })))
  const [armedRemove, setArmedRemove] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const onClick = useCallback((e: React.MouseEvent) => {
    if ((e.target as Element).closest('button,input,label')) return
    usePointCloudStore.getState().clickCloud(id, modeFromEvent(e))
  }, [id])

  if (!cloud) return null
  const label = cloudLabel(cloud)
  const parsing = cloud.status === 'parsing'
  const failed = cloud.status === 'error'
  const dot = failed ? '#E5484D' : parsing ? 'var(--accent)' : issueCount > 0 ? '#F5A623' : '#30A46C'
  const topics = topicsOf(topicState, itemKey('cloud', cloud.fileKey))
  const colour = hexColor(cloud.color ?? 0x888888)

  const remove = (): void => {
    if (parsing || armedRemove) {
      if (timer.current) clearTimeout(timer.current)
      setArmedRemove(false)
      onRemove([id])
      return
    }
    setArmedRemove(true)
    timer.current = setTimeout(() => setArmedRemove(false), 3000)
  }

  return (
    <div
      data-testid="pc-scan-row"
      data-cloud-id={id}
      role="option"
      aria-selected={selected}
      onClick={onClick}
      onDoubleClick={(e) => {
        if ((e.target as Element).closest('button,input,label')) return
        onRenameStart(id)
      }}
      className={[
        'rounded-[10px] border px-2 py-1.5 max-md:min-h-[44px] cursor-pointer transition-colors flex flex-col justify-center',
        selected ? 'border-[var(--accent)] bg-[var(--surface-2)]' : 'border-[var(--border)] hover:bg-[var(--surface-2)]',
        !cloud.visible && !failed ? 'opacity-60' : '',
      ].join(' ')}
    >
      <div className="flex items-center gap-2">
        {multi && (
          <label className="flex items-center justify-center w-5 h-5 max-md:w-11 max-md:h-11 shrink-0 cursor-pointer"
            onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              aria-label={t('list.selectRow', { name: label })}
              checked={selected}
              onChange={() => usePointCloudStore.getState().clickCloud(id, 'toggle')}
              className="accent-[var(--accent)] cursor-pointer"
            />
          </label>
        )}
        <label
          data-testid="pc-row-swatch"
          title={t('list.color', { name: label })}
          className="relative w-4 h-4 max-md:w-6 max-md:h-6 rounded-[4px] shrink-0 cursor-pointer border border-[#0003]"
          style={{ backgroundColor: colour }}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="color"
            aria-label={t('list.color', { name: label })}
            value={colour}
            onChange={(e) => usePointCloudStore.getState().setCloudColor(id, parseInt(e.target.value.slice(1), 16))}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
          <span
            className={`absolute -right-1 -bottom-1 w-2 h-2 rounded-full border border-[var(--surface)] ${parsing ? 'animate-pulse' : ''}`}
            style={{ background: dot }}
            title={issueCount > 0 ? t('list.health', { count: issueCount }) : t('list.healthOk')}
            data-testid="pc-row-health"
          />
        </label>
        <div className="flex-1 min-w-0">
          {renaming ? (
            <RenameInput
              initial={cloud.name ?? ''}
              placeholder={cloud.fileName}
              label={t('list.renameLabel')}
              hint={t('list.useFileName')}
              onDone={(value) => {
                if (value !== null) usePointCloudStore.getState().renameCloud(id, value)
                onRenameEnd()
              }}
            />
          ) : (
            <div className="text-[12.5px] font-medium text-[var(--text)] truncate select-text"
              title={`${cloud.fileName} · ${t('list.renameHint')}`}>
              {label}
            </div>
          )}
          <div className={`text-[11px] font-mono ${failed ? 'text-[#E5484D] select-text' : 'text-[var(--text-faint)]'} truncate flex items-center gap-1`}>
            {topics.length > 0 && (
              <span className="flex gap-0.5 shrink-0" title={topics.map((x) => x.name).join(', ')}>
                {topics.slice(0, 3).map((x) => (
                  <span key={x.id} className="w-1.5 h-1.5 rounded-full" style={{ background: hexColor(x.color) }} />
                ))}
              </span>
            )}
            <span className="truncate">
              {failed
                ? describeError(cloud.errorKey)
                : parsing
                  ? `${t('load.parsingShort')} ${cloud.progress}%`
                  : cloud.sourceKind === 'temporal-replay'
                    ? t('replay.rowStatus')
                    : [
                      t('status.points', { count: formatCount(cloud.pointCount) }),
                      cloud.format.toUpperCase(),
                      cloud.fileDate ? t('list.fileDate', { date: cloud.fileDate }) : null,
                    ].filter(Boolean).join(' · ')}
            </span>
          </div>
        </div>
        {!failed && !parsing && (
          <RowIcon testId="pc-row-locate" label={t('list.locate')} onClick={() => onLocate(id)}>
            <circle cx="7" cy="7" r="3.5" /><path d="M7 1v2.5M7 10.5V13M1 7h2.5M10.5 7H13" />
          </RowIcon>
        )}
        {!failed && (
          <RowIcon label={cloud.visible ? t('actions.visible') : t('actions.hidden')} onClick={() => onVisible([id], !cloud.visible)} pressed={cloud.visible}>
            {cloud.visible
              ? <><path d="M1 7s2.2-4 6-4 6 4 6 4-2.2 4-6 4-6-4-6-4z" /><circle cx="7" cy="7" r="1.8" /></>
              : <><path d="M1 7s2.2-4 6-4 6 4 6 4-2.2 4-6 4-6-4-6-4z" /><path d="M2 12L12 2" /></>}
          </RowIcon>
        )}
        {armedRemove ? (
          <button
            type="button"
            data-testid="pc-row-remove"
            onClick={(e) => { e.stopPropagation(); remove() }}
            className="shrink-0 px-2 py-1 max-md:min-h-[44px] rounded-[7px] text-[11px] font-semibold text-white bg-[#E5484D]"
          >
            {t('list.removeConfirm')}
          </button>
        ) : (
          <RowIcon testId="pc-row-remove" label={parsing ? t('actions.cancel') : t('actions.remove')} onClick={remove} danger>
            <path d="M3 3l8 8M11 3L3 11" />
          </RowIcon>
        )}
      </div>
      {parsing && (
        <div className="mt-1.5 h-[3px] rounded-full bg-[var(--border)] overflow-hidden">
          <div className="h-full bg-[var(--accent)] transition-[width]" style={{ width: `${cloud.progress}%` }} />
        </div>
      )}
    </div>
  )
})

function RenameInput({ initial, placeholder, label, hint, onDone }: {
  initial: string; placeholder: string; label: string; hint: string; onDone: (value: string | null) => void
}) {
  const [value, setValue] = useState(initial)
  const done = useRef(false)
  const finish = (v: string | null): void => {
    if (done.current) return
    done.current = true
    onDone(v)
  }
  return (
    <input
      autoFocus
      value={value}
      placeholder={placeholder}
      aria-label={label}
      title={hint}
      maxLength={80}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={() => finish(value)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') { e.preventDefault(); finish(value) }
        if (e.key === 'Escape') { e.preventDefault(); finish(null) }
      }}
      className="w-full px-1.5 py-0.5 rounded-[6px] text-[12.5px] bg-[var(--surface-2)] border border-[var(--accent)] text-[var(--text)] focus:outline-none select-text"
    />
  )
}
