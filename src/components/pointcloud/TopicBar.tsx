// ─── TopicBar ─────────────────────────────────────────────────────────────────
// Topic chips above the scan list. A chip shows the topics that have LOADED
// members: click selects them, Ctrl/⌘-click adds them, Alt-click shows only
// them, and the eye hides or shows them. 'Group by file date' suggests one
// topic per LAS-header date — a suggestion, never created on its own, and
// named with the bare date because that is all the header actually says.

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import { usePointCloudStore } from '../../stores/pointCloudStore'
import { useTopicStore } from '../../stores/topicStore'
import { fileDateSuggestions, itemKey, MAX_TOPICS, type Topic } from '../../lib/topics'
import { hexColor } from '../../lib/pointcloud/pc-style'

export interface TopicBarProps {
  onVisible: (ids: string[], visible: boolean) => void
  onSolo: (ids: string[]) => void
}

export function TopicBar({ onVisible, onSolo }: TopicBarProps) {
  const { t } = useTranslation('pointcloud')
  const items = usePointCloudStore(useShallow((s) => s.clouds.flatMap((c) => [c.id, c.fileKey, c.visible, c.fileDate])))
  const selected = usePointCloudStore(useShallow((s) => s.selectedCloudIds))
  const topics = useTopicStore((s) => s.topics)
  const members = useTopicStore((s) => s.members)
  const [editing, setEditing] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  const clouds = useMemo(() => {
    const out: { id: string; key: string; visible: boolean; fileDate: string | null }[] = []
    for (let i = 0; i < items.length; i += 4) {
      out.push({ id: items[i] as string, key: itemKey('cloud', items[i + 1] as string), visible: items[i + 2] as boolean, fileDate: (items[i + 3] as string | null | undefined) ?? null })
    }
    return out
  }, [items])

  const loadedOf = (topic: Topic): typeof clouds => clouds.filter((c) => members[c.key]?.includes(topic.id))
  const chips = topics.map((topic) => ({ topic, loaded: loadedOf(topic) })).filter((c) => c.loaded.length > 0)
  const suggestions = useMemo(
    () => fileDateSuggestions(clouds.map((c) => ({ key: c.key, fileDate: c.fileDate })), { topics, members }),
    [clouds, topics, members],
  )
  if (clouds.length === 0) return null

  const atLimit = topics.length >= MAX_TOPICS
  const newTopic = (): void => {
    const keys = clouds.filter((c) => selected.includes(c.id)).map((c) => c.key)
    if (keys.length === 0) return
    useTopicStore.getState().createTopic({ name: t('topics.defaultName', { n: topics.length + 1 }) }, keys)
  }
  const groupByDate = (): void => {
    for (const s of suggestions) {
      useTopicStore.getState().createTopic({ name: s.date, source: 'fileDate', date: s.date }, s.keys)
    }
  }

  return (
    <div data-testid="pc-topic-bar" className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 max-md:overflow-x-auto max-md:flex-nowrap flex-wrap [scrollbar-width:none]">
        {chips.map(({ topic, loaded }) => {
          const ids = loaded.map((c) => c.id)
          const anyVisible = loaded.some((c) => c.visible)
          return (
            <span key={topic.id} data-testid="pc-topic-chip" data-topic-id={topic.id}
              className="inline-flex items-center shrink-0 rounded-full border border-[var(--border-strong)] text-[11.5px] text-[var(--text-dim)]">
              <button
                type="button"
                title={t('topics.chipHint')}
                onClick={(e) => {
                  const store = usePointCloudStore.getState()
                  if (e.altKey) { onSolo(ids); return }
                  if (e.ctrlKey || e.metaKey) store.selectClouds([...new Set([...store.selectedCloudIds, ...ids])])
                  else store.selectClouds(ids)
                }}
                className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 max-md:py-2 hover:text-[var(--text)]"
              >
                <span className="w-2 h-2 rounded-full" data-testid="pc-topic-dot" style={{ background: hexColor(topic.color) }} />
                <span className="max-w-[120px] truncate">{topic.name}</span>
                <span className="font-mono text-[10.5px] text-[var(--text-faint)]">{loaded.length}</span>
              </button>
              <button
                type="button"
                aria-label={anyVisible ? t('topics.hide', { name: topic.name }) : t('topics.show', { name: topic.name })}
                title={anyVisible ? t('topics.hide', { name: topic.name }) : t('topics.show', { name: topic.name })}
                onClick={() => onVisible(ids, !anyVisible)}
                className="pr-2 pl-0.5 py-1 max-md:py-2 text-[var(--text-faint)] hover:text-[var(--text)]"
              >
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                  <path d="M1 7s2.2-4 6-4 6 4 6 4-2.2 4-6 4-6-4-6-4z" />
                  {anyVisible ? <circle cx="7" cy="7" r="1.8" /> : <path d="M2 12L12 2" />}
                </svg>
              </button>
            </span>
          )
        })}
        <button
          type="button"
          data-testid="pc-topic-new"
          disabled={selected.length === 0 || atLimit}
          title={atLimit ? t('topics.limit', { max: MAX_TOPICS }) : selected.length === 0 ? t('topics.empty') : t('topics.newFromSelection')}
          onClick={newTopic}
          className="shrink-0 px-2 py-1 max-md:py-2 rounded-full border border-dashed border-[var(--border-strong)] text-[11.5px] text-[var(--text-dim)] hover:text-[var(--text)] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + {t('topics.add')}
        </button>
        {topics.length > 0 && (
          <button
            type="button"
            data-testid="pc-topic-edit"
            aria-expanded={editing}
            onClick={() => setEditing((v) => !v)}
            className="shrink-0 px-1.5 py-1 max-md:py-2 text-[11.5px] text-[var(--text-faint)] hover:text-[var(--text)] underline underline-offset-2"
          >
            {editing ? t('topics.done') : t('topics.edit')}
          </button>
        )}
        {!dismissed && suggestions.length > 0 && !atLimit && (
          <span className="inline-flex items-center shrink-0 rounded-full bg-[var(--surface-2)] border border-[var(--accent)] text-[11.5px]">
            <button type="button" data-testid="pc-suggest-dates" title={t('topics.byFileDateHint')} onClick={groupByDate}
              className="pl-2 pr-1 py-1 max-md:py-2 text-[var(--text)]">
              {t('topics.byFileDate', { count: suggestions.length })}
            </button>
            <button type="button" aria-label={t('topics.dismiss')} title={t('topics.dismiss')} onClick={() => setDismissed(true)}
              className="pr-2 pl-0.5 py-1 max-md:py-2 text-[var(--text-faint)] hover:text-[var(--text)]">×</button>
          </span>
        )}
      </div>
      {atLimit && <div className="text-[11px] text-[var(--text-faint)]">{t('topics.limit', { max: MAX_TOPICS })}</div>}
      {editing && (
        <div className="rounded-[10px] border border-[var(--border)] px-2.5 py-2 flex flex-col gap-1.5" data-testid="pc-topic-editor">
          <div className="text-[11.5px] font-semibold text-[var(--text-dim)]">{t('topics.title')}</div>
          {topics.map((topic) => (
            <div key={topic.id} className="flex items-center gap-1.5">
              <input
                type="color"
                aria-label={t('topics.color')}
                value={hexColor(topic.color)}
                onChange={(e) => useTopicStore.getState().recolorTopic(topic.id, parseInt(e.target.value.slice(1), 16))}
                className="h-6 w-7 rounded-[5px] border border-[var(--border-strong)] bg-transparent cursor-pointer shrink-0"
              />
              <input
                defaultValue={topic.name}
                aria-label={t('topics.name')}
                maxLength={40}
                onBlur={(e) => useTopicStore.getState().renameTopic(topic.id, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
                  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); e.currentTarget.value = topic.name; e.currentTarget.blur() }
                }}
                className="flex-1 min-w-0 px-1.5 py-1 rounded-[6px] text-[12px] bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] select-text"
              />
              <button
                type="button"
                aria-label={t('topics.delete')}
                title={t('topics.delete')}
                onClick={() => useTopicStore.getState().deleteTopic(topic.id)}
                className="w-7 h-7 max-md:w-10 max-md:h-10 shrink-0 flex items-center justify-center rounded-[7px] text-[var(--text-faint)] hover:text-[#E0523F]"
              >
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M3 3l8 8M11 3L3 11" /></svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
