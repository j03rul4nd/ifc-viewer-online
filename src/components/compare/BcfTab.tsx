// Bring the issue list up to date with the new version.
import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCompareStore } from '../../stores/compareStore'
import { useBcfStore } from '../../stores/bcfStore'
import { planTopicUpdates, buildNewTopics, type TopicPatch } from '../../lib/compare/bcf-sync'
import { downloadBcfBlob } from '../../lib/bcf'
import { toast } from '../../stores/toastStore'
import { useBcfText } from './useCompareText'
import { Button, Check, Hint, Section, stamp } from './ui'

export default function BcfTab() {
  const { t } = useTranslation('compare')
  const { diff, ids } = useCompareStore()
  const topics = useBcfStore((s) => s.topics)
  const addTopics = useBcfStore((s) => s.addTopics)
  const addLocalComment = useBcfStore((s) => s.addLocalComment)
  const updateTopic = useBcfStore((s) => s.updateTopic)
  const exportVersion = useBcfStore((s) => s.exportVersion)
  const [author, setAuthor] = useState(() => { try { return localStorage.getItem('compare.author') ?? '' } catch { return '' } })
  const text = useBcfText(author.trim() || t('bcf.defaultAuthor'))

  const [applyStatus, setApplyStatus] = useState(true)
  const [withIds, setWithIds] = useState(true)
  const [groups, setGroups] = useState<{ added: boolean; removed: boolean; modified: boolean }>({ added: false, removed: true, modified: false })
  const [minGroup, setMinGroup] = useState(1)
  // One-shot per comparison: a second click would duplicate comments / topics.
  const [appliedFor, setAppliedFor] = useState<number | null>(null)
  const [addedFor, setAddedFor] = useState<number | null>(null)

  const patches: TopicPatch[] = useMemo(() => (diff ? planTopicUpdates(topics, diff, text, ids?.diff) : []), [topics, diff, text, ids])
  const preview = useMemo(() => (diff ? buildNewTopics(diff, text, ids?.diff, {
    idsIntroduced: withIds,
    changeStatuses: (Object.keys(groups) as Array<keyof typeof groups>).filter((k) => groups[k]),
    minGroup,
  }) : []), [diff, text, ids, withIds, groups, minGroup])

  if (!diff) return <Hint>{t('changes.empty')}</Hint>

  const withElements = topics.filter((tp) => tp.viewpoints.some((v) => (v.componentGuids?.length ?? 0) > 0)).length
  const toClose = patches.filter((p) => p.proposedStatus).length

  const applyUpdates = (): void => {
    for (const p of patches) {
      addLocalComment(p.topicGuid, p.comment)
      if (applyStatus && p.proposedStatus) updateTopic(p.topicGuid, { status: p.proposedStatus })
    }
    setAppliedFor(diff.createdAt)
    toast(t('bcf.updated', { count: patches.length }), 'success')
  }

  return (
    <div className="flex flex-col gap-5">
      <label className="flex items-center gap-2 text-[11.5px] text-[var(--text-dim)]">
        {t('bcf.author')}
        <input
          value={author} placeholder={t('bcf.defaultAuthor')}
          onChange={(e) => { setAuthor(e.target.value); try { localStorage.setItem('compare.author', e.target.value) } catch { /* private mode */ } }}
          className="h-7 px-2 rounded-md border border-[var(--border)] bg-transparent text-[11.5px] text-[var(--text)] w-[220px]"
        />
      </label>

      <Section title={t('bcf.updateTitle')}>
        <Hint>{t('bcf.updateHint', { total: topics.length, linked: withElements })}</Hint>
        {patches.length > 0 ? (
          <>
            <ul className="m-0 pl-4 text-[11px] text-[var(--text-dim)] max-h-[200px] overflow-auto">
              {patches.slice(0, 100).map((p) => {
                const tp = topics.find((x) => x.guid === p.topicGuid)
                return (
                  <li key={p.topicGuid} className="mb-1">
                    <b className="font-medium text-[var(--text)]">{tp?.title}</b>
                    {p.proposedStatus && <span className="text-[var(--ok)]"> · {t('bcf.willClose')}</span>}
                    <div className="whitespace-pre-line text-[var(--text-faint)]">{p.comment.text}</div>
                  </li>
                )
              })}
            </ul>
            <div className="flex flex-wrap items-center gap-3">
              <Check checked={applyStatus} onChange={setApplyStatus}>{t('bcf.applyStatus', { count: toClose })}</Check>
              <Button small primary disabled={appliedFor === diff.createdAt} onClick={applyUpdates}>{t('bcf.apply', { count: patches.length })}</Button>
            </div>
          </>
        ) : <Hint>{t('bcf.nothingToUpdate')}</Hint>}
      </Section>

      <Section title={t('bcf.createTitle')}>
        <Hint>{t('bcf.createHint')}</Hint>
        <div className="flex flex-wrap gap-3 items-center">
          <Check checked={withIds} onChange={setWithIds}>{t('bcf.fromIds')}{!ids && ` (${t('bcf.runIdsFirst')})`}</Check>
          {(['removed', 'added', 'modified'] as const).map((s) => (
            <Check key={s} checked={groups[s]} onChange={(v) => setGroups((g) => ({ ...g, [s]: v }))}>{t('bcf.groupOf', { status: t(`status.${s}`) })}</Check>
          ))}
          <label className="inline-flex items-center gap-1.5 text-[11.5px] text-[var(--text-dim)]">{t('bcf.minGroup')}
            <input type="number" min={1} value={minGroup} onChange={(e) => setMinGroup(Math.max(1, Number(e.target.value) || 1))}
              className="w-14 h-7 px-1.5 rounded-md border border-[var(--border)] bg-transparent text-[11.5px] text-[var(--text)]" />
          </label>
        </div>
        <Hint>{t('bcf.preview', { count: preview.length })}</Hint>
        <ul className="m-0 pl-4 text-[11px] text-[var(--text-dim)] max-h-[160px] overflow-auto">
          {preview.slice(0, 100).map((tp) => <li key={tp.guid}>{tp.title}</li>)}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button small primary disabled={!preview.length || addedFor === diff.createdAt} onClick={() => { addTopics(preview); setAddedFor(diff.createdAt); toast(t('bcf.created', { count: preview.length }), 'success') }}>
            {t('bcf.addToPanel', { count: preview.length })}
          </Button>
          <Button small disabled={!preview.length} onClick={() => downloadBcfBlob(preview, `${stamp()}_${diff.headLabel}_changes.bcfzip`.replace(/[^\p{L}\p{N}_.-]+/gu, '-'), exportVersion)}>
            {t('bcf.downloadNew')}
          </Button>
          <Button small disabled={!topics.length} onClick={() => downloadBcfBlob(topics, `${stamp()}_issues.bcfzip`, exportVersion)}>
            {t('bcf.downloadAll', { count: topics.length })}
          </Button>
        </div>
      </Section>
    </div>
  )
}
