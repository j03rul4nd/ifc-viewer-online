// ─── BcfPanel ─────────────────────────────────────────────────────────────────
// Full BCF coordination panel: topic list with filter/sort/stats, topic detail
// with inline editing, create form, viewpoint capture, persistent comments.

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import { useBcfStore } from '../stores/bcfStore'
import { importBcf, downloadBcfBlob } from '../lib/bcf'
import { toast } from '../stores/toastStore'
import { trackFeatureUsed } from '../lib/analytics'
import type { BcfTopic, BcfViewpoint, ViewerHandle } from '../types'

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_CYCLE  = ['Open', 'In Progress', 'Closed', "Won't Fix"] as const
const TOPIC_TYPES   = ['Issue', 'Error', 'Warning', 'Info', 'Comment', 'Request', 'Clash'] as const
const PRIORITIES    = ['High', 'Normal', 'Low'] as const

const STATUS_COLORS: Record<string, string> = {
  'Open':        '#ef4444',
  'In Progress': '#f59e0b',
  'Closed':      '#22c55e',
  "Won't Fix":   '#6b7280',
}
const PRIORITY_COLORS: Record<string, string> = {
  'High':   '#ef4444',
  'Normal': '#f59e0b',
  'Low':    '#6b7280',
}
const PRIORITY_ORDER: Record<string, number> = { 'High': 0, 'Normal': 1, 'Low': 2 }
const STATUS_ORDER:   Record<string, number>  = { 'Open': 0, 'In Progress': 1, 'Closed': 2, "Won't Fix": 3 }

function nextStatus(current?: string): string {
  const idx = STATUS_CYCLE.indexOf((current ?? 'Open') as typeof STATUS_CYCLE[number])
  return STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
}

function formatDate(iso?: string): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

// ── Small shared UI pieces ────────────────────────────────────────────────────

function StatusDot({
  status, onClick, size = 8,
}: { status?: string; onClick?: (e: React.MouseEvent) => void; size?: number }) {
  const color = STATUS_COLORS[status ?? 'Open'] ?? '#6b7280'
  return (
    <button
      onClick={onClick}
      title={status ?? 'Open'}
      className={`rounded-full shrink-0 transition-transform ${onClick ? 'hover:scale-125 cursor-pointer' : 'cursor-default'}`}
      style={{ width: size, height: size, background: color, border: 'none', padding: 0 }}
    />
  )
}

function PriorityPip({ priority }: { priority?: string }) {
  if (!priority || priority === 'Normal') return null
  const color = PRIORITY_COLORS[priority] ?? '#6b7280'
  return (
    <span
      className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
      style={{ background: color }}
      title={priority}
    />
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[9px] font-medium text-[var(--text-faint)] uppercase tracking-wider block mb-0.5">
      {children}
    </span>
  )
}

function FieldInput({
  value, onChange, onBlur, placeholder, className = '',
}: {
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
  placeholder?: string
  className?: string
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      className={`w-full text-[11px] text-[var(--text)] bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 h-6 outline-none focus:border-[var(--accent)] transition-colors placeholder:text-[var(--text-faint)] ${className}`}
    />
  )
}

function InlineSelect({
  value, options, onChange, colorMap,
}: {
  value: string
  options: readonly string[]
  onChange: (v: string) => void
  colorMap?: Record<string, string>
}) {
  const color = colorMap?.[value]
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-[10px] font-medium rounded px-1.5 h-5 border outline-none cursor-pointer transition-colors"
      style={{
        background:  'var(--surface-2)',
        borderColor: color ? `${color}55` : 'var(--border)',
        color:       color ?? 'var(--text-dim)',
      }}
    >
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

// ── BcfTopicCard (list row) ───────────────────────────────────────────────────

interface CardProps {
  topic:          BcfTopic
  onOpen:         (guid: string) => void
  onStatusCycle:  (guid: string) => void
  onNavigate:     (topic: BcfTopic) => void
  onDelete:       (guid: string) => void
}

function BcfTopicCard({ topic, onOpen, onStatusCycle, onNavigate, onDelete }: CardProps) {
  const hasCamera   = !!topic.viewpoints[0]?.cameraPosition
  const hasSnapshot = topic.viewpoints[0]?.snapshotBase64
  const commentCnt  = topic.comments.length

  return (
    <div className="border-b border-[var(--border)] group/card">
      <div
        className="flex items-center gap-2.5 px-3 py-2 hover:bg-[var(--surface-2)] cursor-pointer transition-colors"
        onClick={() => onOpen(topic.guid)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onOpen(topic.guid)}
      >
        {/* Status dot — click to cycle */}
        <StatusDot
          status={topic.status}
          size={9}
          onClick={(e) => { e.stopPropagation(); onStatusCycle(topic.guid) }}
        />

        {/* Main content */}
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <PriorityPip priority={topic.priority} />
            {topic.topicType && (
              <span className="text-[9px] font-mono text-[var(--text-faint)] uppercase">{topic.topicType}</span>
            )}
            <span className="text-[12px] text-[var(--text)] font-medium truncate max-w-[240px]">
              {topic.title}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-[var(--text-faint)] font-mono flex-wrap">
            {commentCnt > 0 && <span>{commentCnt} {commentCnt === 1 ? 'comment' : 'comments'}</span>}
            {topic.assignedTo && <span>→ {topic.assignedTo}</span>}
            {topic.dueDate && <span>Due {formatDate(topic.dueDate)}</span>}
            {topic.source === 'generated' && (
              <span className="border border-[var(--border)] px-1 rounded text-[8px]">gen</span>
            )}
          </div>
        </div>

        {/* Snapshot thumbnail */}
        {hasSnapshot && (
          <img
            src={hasSnapshot}
            alt=""
            className="w-12 h-9 object-cover rounded border border-[var(--border)] shrink-0"
          />
        )}

        {/* Actions (hover) */}
        <div className="flex items-center gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity shrink-0">
          {hasCamera && (
            <button
              onClick={(e) => { e.stopPropagation(); onNavigate(topic) }}
              title="Navigate to viewpoint"
              className="w-6 h-6 flex items-center justify-center rounded text-[var(--text-faint)] hover:text-[var(--text)] border border-transparent hover:border-[var(--border)] transition-colors"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 1v8M1 5h8" transform="rotate(45 5 5)" />
              </svg>
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(topic.guid) }}
            title="Delete topic"
            className="w-6 h-6 flex items-center justify-center rounded text-[var(--text-faint)] hover:text-[var(--danger)] border border-transparent hover:border-[var(--danger)]/30 transition-colors"
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" />
            </svg>
          </button>
        </div>

        {/* Chevron */}
        <svg
          width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.3"
          className="text-[var(--text-faint)] shrink-0 opacity-0 group-hover/card:opacity-60 transition-opacity"
        >
          <path d="M2 1.5L6 4L2 6.5" />
        </svg>
      </div>
    </div>
  )
}

// ── BcfDetailView ─────────────────────────────────────────────────────────────

interface DetailProps {
  topicGuid: string
  viewer?:   Pick<ViewerHandle, 'setCameraViewpoint' | 'getCameraViewpoint' | 'takeSnapshot'> | null
  onBack:    () => void
  onDeleted: () => void
}

function BcfDetailView({ topicGuid, viewer, onBack, onDeleted }: DetailProps) {
  const { t } = useTranslation('validation')
  const topic         = useBcfStore((s) => s.topics.find((t) => t.guid === topicGuid))
  const exportVersion = useBcfStore((s) => s.exportVersion)
  const { updateTopic, deleteTopic, addLocalComment, removeLocalComment } = useBcfStore(
    useShallow((s) => ({
      updateTopic:        s.updateTopic,
      deleteTopic:        s.deleteTopic,
      addLocalComment:    s.addLocalComment,
      removeLocalComment: s.removeLocalComment,
    })),
  )

  const [localTitle,  setLocalTitle]  = useState(topic?.title ?? '')
  const [localDesc,   setLocalDesc]   = useState(topic?.description ?? '')
  const [localAssign, setLocalAssign] = useState(topic?.assignedTo ?? '')
  const [newComment,  setNewComment]  = useState('')
  const [authorName,  setAuthorName]  = useState(() => localStorage.getItem('bcf-author') ?? '')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  useEffect(() => {
    if (topic) {
      setLocalTitle(topic.title)
      setLocalDesc(topic.description ?? '')
      setLocalAssign(topic.assignedTo ?? '')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicGuid])

  if (!topic) return null

  const save = (patch: Partial<BcfTopic>) => updateTopic(topicGuid, patch)

  const handleDelete = () => {
    deleteTopic(topicGuid)
    toast(t('bcf.topicDeleted'), 'success')
    onDeleted()
  }

  const handleCaptureView = () => {
    if (!viewer) return
    const snapshot = viewer.takeSnapshot?.() ?? undefined
    // Camera capture shares the same primitive as Tour Mode (D-24). Before,
    // only *imported* viewpoints carried a camera — captured ones were
    // snapshot-only and could not be navigated back to.
    const cam = viewer.getCameraViewpoint?.() ?? null
    const newVp: BcfViewpoint = {
      guid: crypto.randomUUID(),
      snapshotBase64: snapshot,
      ...(cam ? { cameraPosition: cam.position, cameraDirection: cam.direction } : {}),
    }
    save({ viewpoints: [...topic.viewpoints, newVp] })
    toast(t('bcf.captureAdded'), 'success')
  }

  const handleAddComment = () => {
    const text = newComment.trim()
    if (!text) return
    const author = authorName.trim() || 'Anonymous'
    localStorage.setItem('bcf-author', author)
    addLocalComment(topicGuid, { date: new Date().toISOString(), author, text })
    setNewComment('')
  }

  const handleNavigateVp = (vp: BcfViewpoint) => {
    if (vp.cameraPosition && vp.cameraDirection) {
      viewer?.setCameraViewpoint(vp.cameraPosition, vp.cameraDirection)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="flex items-center gap-2 px-3 h-8 border-b border-[var(--border)] shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-[10px] text-[var(--text-faint)] hover:text-[var(--text)] transition-colors font-medium"
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            <path d="M5.5 1.5L2 4l3.5 2.5" />
          </svg>
          {t('bcf.detail.back')}
        </button>
        <div className="flex-1" />
        <button
          onClick={() => downloadBcfBlob([topic], `topic-${topic.guid.slice(0, 8)}.bcfzip`, exportVersion)}
          title={`${t('bcf.exportSingle')} (BCF ${exportVersion})`}
          className="w-6 h-6 flex items-center justify-center rounded text-[var(--text-faint)] hover:text-[var(--text)] border border-transparent hover:border-[var(--border)] transition-colors"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 1v6M2 7l3 2 3-2" /><path d="M1 9h8" />
          </svg>
        </button>
        {showDeleteConfirm ? (
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-[var(--danger)]">Delete?</span>
            <button
              onClick={handleDelete}
              className="px-1.5 h-5 text-[9px] font-medium rounded bg-[var(--danger)]/10 text-[var(--danger)] border border-[var(--danger)]/30"
            >Yes</button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="px-1.5 h-5 text-[9px] text-[var(--text-faint)] border border-[var(--border)] rounded"
            >No</button>
          </div>
        ) : (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            title="Delete topic"
            className="w-6 h-6 flex items-center justify-center rounded text-[var(--text-faint)] hover:text-[var(--danger)] border border-transparent hover:border-[var(--danger)]/30 transition-colors"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3h6M4 3V2h2v1M3 3l.5 5h3L7 3" />
            </svg>
          </button>
        )}
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3">

        {/* Title */}
        <div>
          <input
            value={localTitle}
            onChange={(e) => setLocalTitle(e.target.value)}
            onBlur={() => localTitle.trim() && save({ title: localTitle.trim() })}
            className="w-full text-[13px] font-semibold text-[var(--text)] bg-transparent border-b border-transparent focus:border-[var(--accent)] outline-none pb-0.5 transition-colors placeholder:text-[var(--text-faint)]"
            placeholder="Topic title…"
          />
        </div>

        {/* Status / Type / Priority */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <StatusDot status={topic.status} size={7} />
            <InlineSelect
              value={topic.status ?? 'Open'}
              options={STATUS_CYCLE}
              onChange={(v) => save({ status: v })}
              colorMap={STATUS_COLORS}
            />
          </div>
          <InlineSelect
            value={topic.topicType ?? 'Issue'}
            options={TOPIC_TYPES}
            onChange={(v) => save({ topicType: v })}
          />
          <div className="flex items-center gap-1.5">
            <PriorityPip priority={topic.priority} />
            <InlineSelect
              value={topic.priority ?? 'Normal'}
              options={PRIORITIES}
              onChange={(v) => save({ priority: v })}
              colorMap={PRIORITY_COLORS}
            />
          </div>
        </div>

        {/* Assigned / Due date */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <FieldLabel>{t('bcf.detail.assignedTo')}</FieldLabel>
            <FieldInput
              value={localAssign}
              onChange={setLocalAssign}
              onBlur={() => save({ assignedTo: localAssign.trim() || undefined })}
              placeholder={t('bcf.detail.assignedPlaceholder')}
            />
          </div>
          <div>
            <FieldLabel>{t('bcf.detail.dueDate')}</FieldLabel>
            <input
              type="date"
              value={topic.dueDate ?? ''}
              onChange={(e) => save({ dueDate: e.target.value || undefined })}
              className="w-full text-[11px] text-[var(--text)] bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 h-6 outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <FieldLabel>{t('bcf.detail.description')}</FieldLabel>
          <textarea
            value={localDesc}
            onChange={(e) => setLocalDesc(e.target.value)}
            onBlur={() => save({ description: localDesc.trim() || undefined })}
            placeholder={t('bcf.detail.descPlaceholder')}
            rows={3}
            className="w-full text-[11px] text-[var(--text)] bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1.5 outline-none focus:border-[var(--accent)] transition-colors resize-none placeholder:text-[var(--text-faint)] leading-snug"
          />
        </div>

        {/* Divider */}
        <div className="h-px bg-[var(--border)]" />

        {/* Viewpoints */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <FieldLabel>{t('bcf.detail.viewpoints')} ({topic.viewpoints.length})</FieldLabel>
            {viewer && (
              <button
                onClick={handleCaptureView}
                className="text-[9px] text-[var(--accent)] hover:underline font-medium"
              >
                + {t('bcf.captureView')}
              </button>
            )}
          </div>
          {topic.viewpoints.length === 0 ? (
            <p className="text-[10px] text-[var(--text-faint)] italic">{t('bcf.noViewpoints')}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {topic.viewpoints.map((vp, i) => (
                <div key={vp.guid} className="relative group/vp">
                  <button
                    onClick={() => handleNavigateVp(vp)}
                    disabled={!vp.cameraPosition}
                    title={vp.cameraPosition ? t('bcf.navigate') : t('bcf.noViewpoints')}
                    className="block rounded overflow-hidden border border-[var(--border)] hover:border-[var(--accent)] transition-colors disabled:opacity-50"
                  >
                    {vp.snapshotBase64 ? (
                      <img src={vp.snapshotBase64} alt="" className="w-20 h-14 object-cover block" />
                    ) : (
                      <div className="w-20 h-14 bg-[var(--surface-2)] flex flex-col items-center justify-center gap-1">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-[var(--text-faint)]">
                          <rect x="1" y="3" width="12" height="9" rx="1.5" />
                          <circle cx="7" cy="7.5" r="2.5" />
                          <path d="M4.5 3L5.5 1.5h3L9.5 3" />
                        </svg>
                        <span className="text-[8px] text-[var(--text-faint)] font-mono">VP {i + 1}</span>
                      </div>
                    )}
                  </button>
                  <button
                    onClick={() => save({ viewpoints: topic.viewpoints.filter((v) => v.guid !== vp.guid) })}
                    title="Remove viewpoint"
                    className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 text-white rounded flex items-center justify-center opacity-0 group-hover/vp:opacity-100 transition-opacity"
                  >
                    <svg width="6" height="6" viewBox="0 0 6 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M1 1l4 4M5 1L1 5" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="h-px bg-[var(--border)]" />

        {/* Comments */}
        <div>
          <FieldLabel>{t('bcf.detail.comments')} ({topic.comments.length})</FieldLabel>
          {topic.comments.length > 0 ? (
            <ul className="flex flex-col gap-1.5 mb-2">
              {topic.comments.map((c) => (
                <li key={c.guid} className="group/comment flex items-start gap-2">
                  <div className="flex-1 min-w-0 bg-[var(--surface-2)] rounded px-2 py-1.5 border border-[var(--border)]">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[10px] font-semibold text-[var(--text)]">{c.author || 'Anonymous'}</span>
                      <span className="text-[9px] text-[var(--text-faint)] font-mono">{formatDate(c.date)}</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-dim)] leading-snug whitespace-pre-wrap">{c.text}</p>
                  </div>
                  <button
                    onClick={() => removeLocalComment(topicGuid, c.guid)}
                    title={t('bcf.comment.delete')}
                    className="opacity-0 group-hover/comment:opacity-100 w-5 h-5 flex items-center justify-center rounded text-[var(--text-faint)] hover:text-[var(--danger)] transition-all shrink-0 mt-0.5"
                  >
                    <svg width="7" height="7" viewBox="0 0 7 7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M1 1l5 5M6 1L1 6" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[10px] text-[var(--text-faint)] italic mb-2">{t('bcf.comment.noComments')}</p>
          )}

          {/* Add comment */}
          <div className="flex flex-col gap-1">
            <FieldInput
              value={authorName}
              onChange={(v) => { setAuthorName(v); localStorage.setItem('bcf-author', v) }}
              placeholder={t('bcf.comment.author')}
            />
            <div className="flex gap-1">
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddComment() } }}
                placeholder={t('bcf.comment.placeholder')}
                rows={2}
                className="flex-1 text-[11px] text-[var(--text)] bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1 outline-none focus:border-[var(--accent)] transition-colors resize-none placeholder:text-[var(--text-faint)] leading-snug"
              />
              <button
                onClick={handleAddComment}
                disabled={!newComment.trim()}
                className="px-2.5 rounded text-[10px] font-medium border transition-colors self-end h-7 shrink-0"
                style={{
                  background:  newComment.trim() ? 'var(--accent)' : 'var(--surface-2)',
                  color:       newComment.trim() ? '#fff' : 'var(--text-faint)',
                  borderColor: newComment.trim() ? 'var(--accent)' : 'var(--border)',
                }}
              >
                {t('bcf.comment.submit')}
              </button>
            </div>
          </div>
        </div>

        {/* Bottom padding */}
        <div className="h-4 shrink-0" />
      </div>
    </div>
  )
}

// ── BcfCreateForm ─────────────────────────────────────────────────────────────

interface CreateFormProps {
  viewer?:   Pick<ViewerHandle, 'setCameraViewpoint' | 'getCameraViewpoint' | 'takeSnapshot'> | null
  onBack:    () => void
  onCreated: (guid: string) => void
}

function BcfCreateForm({ viewer, onBack, onCreated }: CreateFormProps) {
  const { t } = useTranslation('validation')
  const addTopic = useBcfStore((s) => s.addTopic)

  const [title,       setTitle]       = useState('')
  const [type,        setType]        = useState<string>('Issue')
  const [priority,    setPriority]    = useState<string>('Normal')
  const [desc,        setDesc]        = useState('')
  const [assigned,    setAssigned]    = useState('')
  const [due,         setDue]         = useState('')
  const [captureView, setCaptureView] = useState(!!viewer)

  const titleRef = useRef<HTMLInputElement>(null)
  useEffect(() => { titleRef.current?.focus() }, [])

  const handleCreate = useCallback(() => {
    if (!title.trim()) return
    const snapshot  = captureView && viewer ? (viewer.takeSnapshot?.() ?? undefined) : undefined
    const vpGuid    = crypto.randomUUID()
    const viewpoints: BcfViewpoint[] = snapshot ? [{ guid: vpGuid, snapshotBase64: snapshot }] : []
    const guid = crypto.randomUUID()
    const topic: BcfTopic = {
      guid,
      title:          title.trim(),
      description:    desc.trim() || undefined,
      status:         'Open',
      topicType:      type,
      priority,
      dueDate:        due || undefined,
      assignedTo:     assigned.trim() || undefined,
      creationDate:   new Date().toISOString(),
      creationAuthor: localStorage.getItem('bcf-author') ?? 'IFC Viewer',
      viewpoints,
      comments:       [],
      source:         'generated',
    }
    addTopic(topic)
    trackFeatureUsed({ feature: 'bcf_create_topic' })
    toast(t('bcf.topicCreated'), 'success')
    onCreated(guid)
  }, [title, desc, type, priority, due, assigned, captureView, viewer, addTopic, t, onCreated])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 h-8 border-b border-[var(--border)] shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-[10px] text-[var(--text-faint)] hover:text-[var(--text)] transition-colors font-medium"
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            <path d="M5.5 1.5L2 4l3.5 2.5" />
          </svg>
          {t('run.cancel')}
        </button>
        <span className="flex-1 text-[11px] font-semibold text-[var(--text)]">{t('bcf.create.heading')}</span>
        <button
          onClick={handleCreate}
          disabled={!title.trim()}
          className="px-2.5 h-6 text-[10px] font-semibold rounded transition-colors"
          style={{
            background:  title.trim() ? 'var(--accent)' : 'var(--surface-2)',
            color:       title.trim() ? '#fff' : 'var(--text-faint)',
            border:      title.trim() ? '1px solid var(--accent)' : '1px solid var(--border)',
          }}
        >
          {t('bcf.createTopic')}
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3">

        {/* Title */}
        <div>
          <FieldLabel>{t('bcf.create.titleLabel')} *</FieldLabel>
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && title.trim()) handleCreate() }}
            placeholder={t('bcf.create.titlePlaceholder')}
            className="w-full text-[12px] text-[var(--text)] bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 h-7 outline-none focus:border-[var(--accent)] transition-colors placeholder:text-[var(--text-faint)]"
          />
        </div>

        {/* Type + Priority */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <FieldLabel>{t('bcf.detail.type')}</FieldLabel>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full text-[11px] text-[var(--text)] bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 h-6 outline-none focus:border-[var(--accent)] transition-colors cursor-pointer"
            >
              {TOPIC_TYPES.map((tp) => <option key={tp} value={tp}>{tp}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel>{t('bcf.detail.priority')}</FieldLabel>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full text-[11px] text-[var(--text)] bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 h-6 outline-none focus:border-[var(--accent)] transition-colors cursor-pointer"
            >
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>

        {/* Assigned + Due */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <FieldLabel>{t('bcf.detail.assignedTo')}</FieldLabel>
            <FieldInput
              value={assigned}
              onChange={setAssigned}
              placeholder={t('bcf.detail.assignedPlaceholder')}
            />
          </div>
          <div>
            <FieldLabel>{t('bcf.detail.dueDate')}</FieldLabel>
            <input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className="w-full text-[11px] text-[var(--text)] bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 h-6 outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <FieldLabel>{t('bcf.detail.description')}</FieldLabel>
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder={t('bcf.detail.descPlaceholder')}
            rows={3}
            className="w-full text-[11px] text-[var(--text)] bg-[var(--surface-2)] border border-[var(--border)] rounded px-2 py-1.5 outline-none focus:border-[var(--accent)] transition-colors resize-none placeholder:text-[var(--text-faint)] leading-snug"
          />
        </div>

        {/* Capture view checkbox */}
        {viewer && (
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={captureView}
              onChange={(e) => setCaptureView(e.target.checked)}
              className="mt-0.5 accent-[var(--accent)]"
            />
            <span className="text-[11px] text-[var(--text-dim)] leading-snug">{t('bcf.create.captureView')}</span>
          </label>
        )}
      </div>
    </div>
  )
}

// ── BcfListView ───────────────────────────────────────────────────────────────

interface ListViewProps {
  viewer?:       Pick<ViewerHandle, 'setCameraViewpoint' | 'getCameraViewpoint' | 'takeSnapshot'> | null
  onSelectTopic: (guid: string) => void
  onCreateNew:   () => void
}

function BcfListView({ viewer, onSelectTopic, onCreateNew }: ListViewProps) {
  const { t } = useTranslation('validation')
  const { topics, isParsing, updateTopic, deleteTopic, clearTopics, exportVersion, setExportVersion } = useBcfStore(
    useShallow((s) => ({
      topics:           s.topics,
      isParsing:        s.isParsing,
      updateTopic:      s.updateTopic,
      deleteTopic:      s.deleteTopic,
      clearTopics:      s.clearTopics,
      exportVersion:    s.exportVersion,
      setExportVersion: s.setExportVersion,
    })),
  )

  const [search,       setSearch]       = useState('')
  const [filterStatus, setFilterStatus] = useState<string | null>(null)
  const [sortBy,       setSortBy]       = useState<'newest' | 'oldest' | 'priority' | 'status'>('newest')

  const fileRef = useRef<HTMLInputElement>(null)

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    open:      topics.filter((t) => !t.status || t.status === 'Open').length,
    inProgress:topics.filter((t) => t.status === 'In Progress').length,
    closed:    topics.filter((t) => t.status === 'Closed').length,
    wontFix:   topics.filter((t) => t.status === "Won't Fix").length,
  }), [topics])

  // ── Filter + sort ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = topics
    if (filterStatus) {
      list = list.filter((t) => (t.status ?? 'Open') === filterStatus)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.description?.toLowerCase().includes(q) ||
          t.assignedTo?.toLowerCase().includes(q) ||
          t.topicType?.toLowerCase().includes(q),
      )
    }
    return [...list].sort((a, b) => {
      if (sortBy === 'newest') return (b.creationDate ?? '').localeCompare(a.creationDate ?? '')
      if (sortBy === 'oldest') return (a.creationDate ?? '').localeCompare(b.creationDate ?? '')
      if (sortBy === 'priority') return (PRIORITY_ORDER[a.priority ?? 'Normal'] ?? 1) - (PRIORITY_ORDER[b.priority ?? 'Normal'] ?? 1)
      if (sortBy === 'status')   return (STATUS_ORDER[a.status ?? 'Open'] ?? 0) - (STATUS_ORDER[b.status ?? 'Open'] ?? 0)
      return 0
    })
  }, [topics, filterStatus, search, sortBy])

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    void importBcf(file)
    trackFeatureUsed({ feature: 'bcf_import' })
    e.target.value = ''
  }, [])

  const handleExportAll = useCallback(() => {
    downloadBcfBlob(topics, 'bcf-topics.bcfzip', exportVersion)
    trackFeatureUsed({ feature: 'bcf_export' })
  }, [topics, exportVersion])

  const handleStatusCycle = useCallback((guid: string) => {
    const topic = topics.find((t) => t.guid === guid)
    if (!topic) return
    updateTopic(guid, { status: nextStatus(topic.status) })
  }, [topics, updateTopic])

  const handleDelete = useCallback((guid: string) => {
    deleteTopic(guid)
    toast(t('bcf.topicDeleted'), 'success')
  }, [deleteTopic, t])

  const handleNavigate = useCallback((topic: BcfTopic) => {
    const vp = topic.viewpoints[0]
    if (vp?.cameraPosition && vp?.cameraDirection) {
      viewer?.setCameraViewpoint(vp.cameraPosition, vp.cameraDirection)
    }
  }, [viewer])

  const statChips = [
    { label: t('bcf.topic.open'),       key: 'Open',        count: stats.open,       color: STATUS_COLORS['Open'] },
    { label: t('bcf.topic.inProgress'), key: 'In Progress', count: stats.inProgress, color: STATUS_COLORS['In Progress'] },
    { label: t('bcf.topic.closed'),     key: 'Closed',      count: stats.closed,     color: STATUS_COLORS['Closed'] },
    { label: t('bcf.topic.wontFix'),    key: "Won't Fix",   count: stats.wontFix,    color: STATUS_COLORS["Won't Fix"] },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* ── Header row ── */}
      <div className="flex items-center gap-1.5 px-3 h-8 border-b border-[var(--border)] shrink-0">
        <span className="text-[11px] font-semibold text-[var(--text)] flex-1">{t('bcf.title')}</span>
        <input ref={fileRef} type="file" accept=".bcfzip,.bcf" className="hidden" onChange={handleImport} />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={isParsing}
          title={t('bcf.import')}
          className="w-6 h-6 flex items-center justify-center rounded text-[var(--text-faint)] hover:text-[var(--text)] border border-[var(--border)] hover:border-[var(--text-faint)] disabled:opacity-40 transition-colors"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 7V1M2 5l3-4 3 4" /><path d="M1 9h8" />
          </svg>
        </button>
        {topics.length > 0 && (
          <div
            className="flex items-center rounded border border-[var(--border)] overflow-hidden h-6 shrink-0"
            title={t('bcf.exportVersion')}
          >
            {(['2.1', '3.0'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setExportVersion(v)}
                className="px-1.5 h-full text-[9px] font-mono font-semibold transition-colors"
                style={exportVersion === v
                  ? { background: 'var(--accent)', color: '#fff' }
                  : { color: 'var(--text-faint)', background: 'transparent' }}
              >
                {v}
              </button>
            ))}
          </div>
        )}
        {topics.length > 0 && (
          <button
            onClick={handleExportAll}
            title={t('bcf.exportTopics')}
            className="w-6 h-6 flex items-center justify-center rounded text-[var(--text-faint)] hover:text-[var(--text)] border border-[var(--border)] hover:border-[var(--text-faint)] transition-colors"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 1v6M2 7l3 2 3-2" /><path d="M1 9h8" />
            </svg>
          </button>
        )}
        {topics.length > 0 && (
          <button
            onClick={() => clearTopics()}
            title={t('bcf.clear')}
            className="w-6 h-6 flex items-center justify-center rounded text-[var(--text-faint)] hover:text-[var(--danger)] border border-transparent hover:border-[var(--danger)]/30 transition-colors"
          >
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <path d="M1.5 1.5l6 6M7.5 1.5l-6 6" />
            </svg>
          </button>
        )}
        <button
          onClick={onCreateNew}
          className="flex items-center gap-1 px-2 h-6 rounded text-[10px] font-semibold border transition-colors"
          style={{ background: 'var(--accent)14', color: 'var(--accent)', borderColor: 'var(--accent)33' }}
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 1v6M1 4h6" />
          </svg>
          {t('bcf.newTopic')}
        </button>
      </div>

      {/* ── Stats chips ── */}
      {topics.length > 0 && (
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[var(--border)] shrink-0 overflow-x-auto">
          <button
            onClick={() => setFilterStatus(null)}
            className="text-[9px] font-mono px-1.5 h-4.5 rounded transition-colors shrink-0"
            style={
              !filterStatus
                ? { background: 'var(--surface-2)', color: 'var(--text-dim)', border: '1px solid var(--border)' }
                : { color: 'var(--text-faint)', border: '1px solid transparent' }
            }
          >
            All {topics.length}
          </button>
          {statChips.filter((c) => c.count > 0).map((chip) => (
            <button
              key={chip.key}
              onClick={() => setFilterStatus(filterStatus === chip.key ? null : chip.key)}
              className="flex items-center gap-1 text-[9px] font-mono px-1.5 rounded transition-colors shrink-0"
              style={{
                height: '18px',
                background:  filterStatus === chip.key ? `${chip.color}22` : 'transparent',
                color:        filterStatus === chip.key ? chip.color : 'var(--text-faint)',
                border:       filterStatus === chip.key ? `1px solid ${chip.color}55` : '1px solid transparent',
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: chip.color }} />
              {chip.label} {chip.count}
            </button>
          ))}
        </div>
      )}

      {/* ── Search + sort toolbar ── */}
      {topics.length > 0 && (
        <div className="flex items-center gap-1.5 px-3 h-7 border-b border-[var(--border)] shrink-0">
          <div className="relative flex-1">
            <svg
              className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)] pointer-events-none"
              width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.5"
            >
              <circle cx="3.5" cy="3.5" r="2.5" /><path d="M6 6l2 2" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search topics…"
              className="w-full text-[10px] bg-transparent text-[var(--text)] pl-5 pr-1 h-5 outline-none placeholder:text-[var(--text-faint)]"
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="text-[9px] text-[var(--text-faint)] bg-transparent border-0 outline-none cursor-pointer shrink-0"
          >
            <option value="newest">{t('bcf.sort.newest')}</option>
            <option value="oldest">{t('bcf.sort.oldest')}</option>
            <option value="priority">{t('bcf.sort.priority')}</option>
            <option value="status">{t('bcf.sort.status')}</option>
          </select>
        </div>
      )}

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto">
        {isParsing && (
          <div className="px-3 py-2 text-[11px] text-[var(--accent)] animate-pulse border-b border-[var(--border)]">
            {t('bcf.importing')}
          </div>
        )}

        {!isParsing && topics.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-4">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1" className="text-[var(--text-faint)] mb-1">
              <rect x="4" y="6" width="24" height="20" rx="2" strokeDasharray="3 2" />
              <path d="M10 13h12M10 17h8" />
            </svg>
            <p className="text-[11px] text-[var(--text-dim)] font-medium">{t('bcf.noTopics')}</p>
            <p className="text-[10px] text-[var(--text-faint)]">{t('bcf.noTopicsDesc')}</p>
            <button
              onClick={onCreateNew}
              className="mt-1 px-3 h-6 rounded text-[10px] font-semibold border transition-colors"
              style={{ background: 'var(--accent)14', color: 'var(--accent)', borderColor: 'var(--accent)33' }}
            >
              + {t('bcf.newTopic')}
            </button>
          </div>
        )}

        {filtered.length === 0 && topics.length > 0 && (
          <p className="text-[10px] text-[var(--text-faint)] text-center py-6 italic">No topics match the filter</p>
        )}

        {filtered.map((topic) => (
          <BcfTopicCard
            key={topic.guid}
            topic={topic}
            onOpen={onSelectTopic}
            onStatusCycle={handleStatusCycle}
            onNavigate={handleNavigate}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  )
}

// ── BcfPanel (main export) ────────────────────────────────────────────────────

interface BcfPanelProps {
  viewer?: Pick<ViewerHandle, 'setCameraViewpoint' | 'getCameraViewpoint' | 'takeSnapshot'> | null
}

type PanelView = 'list' | 'detail' | 'create'

export default function BcfPanel({ viewer }: BcfPanelProps) {
  const [view,         setView]         = useState<PanelView>('list')
  const [selectedGuid, setSelectedGuid] = useState<string | null>(null)

  const handleSelectTopic = useCallback((guid: string) => {
    setSelectedGuid(guid)
    setView('detail')
  }, [])

  const handleBack = useCallback(() => {
    setSelectedGuid(null)
    setView('list')
  }, [])

  if (view === 'create') {
    return (
      <BcfCreateForm
        viewer={viewer}
        onBack={handleBack}
        onCreated={(guid) => { setSelectedGuid(guid); setView('detail') }}
      />
    )
  }

  if (view === 'detail' && selectedGuid) {
    return (
      <BcfDetailView
        topicGuid={selectedGuid}
        viewer={viewer}
        onBack={handleBack}
        onDeleted={handleBack}
      />
    )
  }

  return (
    <BcfListView
      viewer={viewer}
      onSelectTopic={handleSelectTopic}
      onCreateNew={() => setView('create')}
    />
  )
}
