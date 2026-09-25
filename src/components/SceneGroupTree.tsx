// ─── SceneGroupTree ───────────────────────────────────────────────────────────
// The scene organised into the structures it contains: groups of IFC files
// (inferred or made by hand) with their point clouds inside, a tray for clouds
// that belong nowhere yet, and every way to fix a wrong guess — drag a file or
// cloud onto a group, the "move to" menu on each row, new / rename / reorder /
// delete group.
//
// Touching an INFERRED group (renaming it, dropping something in it, reordering
// it) first turns it into a user group with the same members. From then on it
// is the user's: it no longer regroups itself when a spatial tree arrives, which
// is exactly what someone who just arranged it by hand expects.
//
// The composition is `lib/scene-tree`; the overrides are `sceneGroupStore`.

import React, { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ViewerAPI } from '../lib/viewer'
import type { SceneModel } from '../types'
import type { SceneTreeGroup } from '../lib/scene-tree'
import { LOOSE } from '../lib/scene-tree'
import type { GroupBasis } from '../lib/model-grouping'
import { useSceneGroupStore } from '../stores/sceneGroupStore'
import { usePointCloudStore } from '../stores/pointCloudStore'
import { modelFileKey } from '../hooks/useModelGroups'
import type { PointCloudEntry } from '../lib/pointcloud/pc-types'

type DragItem = { kind: 'model' | 'cloud'; id: string }
const DND_MIME = 'application/x-ifcv-scene-item'

interface SceneGroupTreeProps {
  groups: SceneTreeGroup[]
  looseCloudIds: string[]
  modelsById: Map<string, SceneModel>
  activeModelId: string | null
  viewerApiRef: React.MutableRefObject<ViewerAPI | null>
  /** Group id per model/cloud id, for scoped framing. */
  groupIdOf: Record<string, string>
  renderModelRow: (model: SceneModel, moveControl: React.ReactNode) => React.ReactNode
  onSetVisible: (id: string, visible: boolean) => void
  /** "Move together" — edit the whole group's transform. */
  onMoveTogether: (group: SceneTreeGroup) => void
  moveTogetherActive: (group: SceneTreeGroup) => boolean
}

// ── Small icons ──────────────────────────────────────────────────────────────

const EyeIcon = ({ on }: { on: boolean }): React.ReactElement => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
    {on
      ? <><path d="M1 6s1.8-3.5 5-3.5S11 6 11 6 9.2 9.5 6 9.5 1 6 1 6z"/><circle cx="6" cy="6" r="1.5"/></>
      : <><path d="M1 6s1.8-3.5 5-3.5S11 6 11 6 9.2 9.5 6 9.5 1 6 1 6z" opacity="0.4"/><path d="M1.5 1.5l9 9"/></>}
  </svg>
)
const FrameIcon = (): React.ReactElement => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
    <path d="M1 4V1.5A.5.5 0 0 1 1.5 1H4M8 1h2.5a.5.5 0 0 1 .5.5V4M11 8v2.5a.5.5 0 0 1-.5.5H8M4 11H1.5a.5.5 0 0 1-.5-.5V8"/>
  </svg>
)
const MoveIcon = (): React.ReactElement => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1.5 3.5h4l1 1h4v5.5h-9z"/><path d="M6 6.5h3M8 5.5l1 1-1 1"/>
  </svg>
)

const iconBtn = 'flex-none w-6 h-6 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text)] transition-colors'

// ── Move-to control ──────────────────────────────────────────────────────────
// A native <select> laid over an icon: one tap on a phone, keyboard and screen
// reader for free, and no custom popover to position inside a scrolling panel.

const NEW = '__new__'
const AUTO = '__auto__'

function MoveToControl({
  groups, currentGroupId, isUserAssigned, allowAuto, onPick, label,
}: {
  groups: SceneTreeGroup[]
  currentGroupId: string | null
  isUserAssigned: boolean
  allowAuto: boolean
  onPick: (value: string) => void
  label: string
}): React.ReactElement {
  const { t } = useTranslation('viewer')
  const userGroups = groups.filter((g) => g.user)
  const autoGroups = groups.filter((g) => !g.user && g.memberIds.length > 1)
  return (
    <label className={`${iconBtn} relative cursor-pointer`} title={label} onClick={(e) => e.stopPropagation()}>
      <MoveIcon />
      <select
        aria-label={label}
        value=""
        onChange={(e) => { if (e.target.value) onPick(e.target.value) }}
        className="absolute inset-0 opacity-0 cursor-pointer"
      >
        <option value="" disabled>{label}</option>
        {userGroups.length > 0 && (
          <optgroup label={t('scene.tree.myGroups')}>
            {userGroups.map((g) => (
              <option key={g.id} value={g.id} disabled={g.id === currentGroupId}>{g.label}</option>
            ))}
          </optgroup>
        )}
        {autoGroups.length > 0 && (
          <optgroup label={t('scene.tree.detectedGroups')}>
            {autoGroups.map((g) => (
              <option key={g.id} value={g.id} disabled={g.id === currentGroupId}>{g.label}</option>
            ))}
          </optgroup>
        )}
        <option value={NEW}>{t('scene.tree.newGroupEllipsis')}</option>
        {allowAuto && isUserAssigned && <option value={AUTO}>{t('scene.tree.backToAuto')}</option>}
        <option value={LOOSE}>{t('scene.tree.noGroup')}</option>
      </select>
    </label>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function SceneGroupTree({
  groups, looseCloudIds, modelsById, activeModelId, viewerApiRef, groupIdOf,
  renderModelRow, onSetVisible, onMoveTogether, moveTogetherActive,
}: SceneGroupTreeProps): React.ReactElement {
  const { t } = useTranslation('viewer')
  const store = useSceneGroupStore()
  const clouds = usePointCloudStore((s) => s.clouds)
  const cloudsById = useMemo(() => new Map(clouds.map((c) => [c.id, c])), [clouds])

  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [renaming, setRenaming] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const dragRef = useRef<DragItem | null>(null)

  const cloudKeysOf = useCallback((g: SceneTreeGroup) =>
    g.cloudIds.map((id) => cloudsById.get(id)?.fileKey).filter((k): k is string => !!k), [cloudsById])
  const modelKeysOf = useCallback((g: SceneTreeGroup) =>
    g.memberIds.map((id) => modelsById.get(id)).filter((m): m is SceneModel => !!m).map(modelFileKey), [modelsById])

  /** The user group this group is, or becomes. */
  const materialize = useCallback((g: SceneTreeGroup): string =>
    g.user ? g.id : store.createGroup(g.label, modelKeysOf(g), cloudKeysOf(g)),
  [store, modelKeysOf, cloudKeysOf])

  const newGroupName = useCallback(() =>
    t('scene.tree.defaultName', { n: groups.filter((g) => g.user).length + 1 }), [t, groups])

  /** Resolve a move-to pick into an assignment, creating/materialising as needed. */
  const resolveTarget = useCallback((value: string): string | null => {
    if (value === AUTO) return null
    if (value === LOOSE) return LOOSE
    if (value === NEW) {
      const id = store.createGroup(newGroupName())
      setRenaming(id)
      return id
    }
    const g = groups.find((x) => x.id === value)
    return g ? materialize(g) : null
  }, [store, newGroupName, groups, materialize])

  const moveModel = useCallback((model: SceneModel, value: string) => {
    store.assignModel(modelFileKey(model), resolveTarget(value))
  }, [store, resolveTarget])

  const moveCloud = useCallback((cloud: PointCloudEntry, value: string) => {
    store.assignCloud(cloud.fileKey, resolveTarget(value))
  }, [store, resolveTarget])

  // ── Visibility / framing per group ─────────────────────────────────────────

  const setCloudVisible = useCallback((cloud: PointCloudEntry, v: boolean) => {
    usePointCloudStore.getState().setVisible(cloud.id, v)
    void viewerApiRef.current?.getPointClouds().then((s) => s.setVisible(cloud.id, v))
  }, [viewerApiRef])

  const groupVisible = (g: SceneTreeGroup): boolean =>
    g.memberIds.some((id) => modelsById.get(id)?.visible) || g.cloudIds.some((id) => cloudsById.get(id)?.visible)

  const toggleGroup = (g: SceneTreeGroup): void => {
    const v = !groupVisible(g)
    for (const id of g.memberIds) onSetVisible(id, v)
    for (const id of g.cloudIds) { const c = cloudsById.get(id); if (c) setCloudVisible(c, v) }
  }

  const frame = (ids: string[]): void => { viewerApiRef.current?.frameItems(ids, { groupIdOf }) }

  // ── Drag and drop ──────────────────────────────────────────────────────────

  const dragProps = (item: DragItem) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      dragRef.current = item
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData(DND_MIME, JSON.stringify(item))
    },
    onDragEnd: () => { dragRef.current = null; setDropTarget(null) },
  })

  const dropProps = (targetId: string, onDrop: (item: DragItem) => void) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!dragRef.current) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (dropTarget !== targetId) setDropTarget(targetId)
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDropTarget(null)
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      const item = dragRef.current
      dragRef.current = null
      setDropTarget(null)
      if (item) onDrop(item)
    },
  })

  const dropOnto = (value: string) => (item: DragItem): void => {
    if (item.kind === 'model') {
      const m = modelsById.get(item.id)
      if (m && groupIdOf[m.id] !== value) moveModel(m, value)
    } else {
      const c = cloudsById.get(item.id)
      if (c && groupIdOf[c.id] !== value) moveCloud(c, value)
    }
  }

  // ── Rows ───────────────────────────────────────────────────────────────────

  const modelMove = (m: SceneModel): React.ReactNode => (
    <MoveToControl
      groups={groups}
      currentGroupId={groupIdOf[m.id] ?? null}
      isUserAssigned={modelFileKey(m) in store.modelAssign}
      allowAuto
      onPick={(v) => moveModel(m, v)}
      label={t('scene.tree.moveTo')}
    />
  )

  const cloudRow = (c: PointCloudEntry): React.ReactNode => (
    <div
      key={c.id}
      {...dragProps({ kind: 'cloud', id: c.id })}
      className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-transparent hover:bg-[rgba(255,255,255,0.04)]"
    >
      <button
        onClick={() => setCloudVisible(c, !c.visible)}
        title={c.visible ? t('scene.tree.hide') : t('scene.tree.show')}
        className={`${iconBtn} ${c.visible ? 'text-[var(--accent)]' : ''}`}
      >
        <EyeIcon on={c.visible} />
      </button>
      <span className="flex-none text-[8.5px] font-semibold px-1 py-px rounded bg-[rgba(64,196,160,0.14)] text-[rgb(90,210,170)]">PC</span>
      <span className="flex-1 min-w-0">
        <span className="block truncate text-[11.5px] text-[var(--text)]" title={c.fileName}>{c.fileName}</span>
        <span className="block text-[10px] text-[var(--text-muted)] tabular-nums">
          {t('scene.tree.points', { count: c.pointCount, formatted: c.pointCount.toLocaleString() })}
        </span>
      </span>
      <button onClick={() => frame([c.id])} title={t('scene.frameCamera')} className={iconBtn}><FrameIcon /></button>
      <MoveToControl
        groups={groups}
        currentGroupId={groupIdOf[c.id] ?? null}
        isUserAssigned={c.fileKey in store.cloudAssign}
        allowAuto
        onPick={(v) => moveCloud(c, v)}
        label={t('scene.tree.moveTo')}
      />
    </div>
  )

  const basisLabel = (b: GroupBasis): string => t(`scene.tree.basis.${b}`)

  // ── Render ─────────────────────────────────────────────────────────────────

  const looseClouds = looseCloudIds.map((id) => cloudsById.get(id)).filter((c): c is PointCloudEntry => !!c)
  const userCount = groups.filter((g) => g.user).length

  return (
    <div className="space-y-1">
      {groups.map((g) => {
        const members = g.memberIds.map((id) => modelsById.get(id)).filter((m): m is SceneModel => !!m)
        const gClouds = g.cloudIds.map((id) => cloudsById.get(id)).filter((c): c is PointCloudEntry => !!c)
        // A group of one file and nothing else is just a file. Showing a header
        // over every single model would be noise pretending to be structure.
        const isFamily = g.user || members.length + gClouds.length > 1
        if (!isFamily) {
          const m = members[0]
          if (!m) return null
          return (
            <div key={g.id} {...dragProps({ kind: 'model', id: m.id })}>
              {renderModelRow(m, modelMove(m))}
            </div>
          )
        }
        const isCollapsed = collapsed.has(g.id)
        const vis = groupVisible(g)
        const userIdx = g.user ? groups.filter((x) => x.user).findIndex((x) => x.id === g.id) : -1
        const hasActive = members.some((m) => m.id === activeModelId)
        return (
          <div
            key={g.id}
            {...dropProps(g.id, dropOnto(g.id))}
            className={`rounded-[8px] border transition-colors ${
              dropTarget === g.id ? 'border-[var(--accent)] bg-[rgba(94,106,210,0.08)]'
                : hasActive ? 'border-[var(--border-strong)]' : 'border-[var(--border)]'
            }`}
          >
            <div className="flex items-center gap-1 px-1.5 py-1.5">
              <button
                onClick={() => setCollapsed((prev) => {
                  const next = new Set(prev)
                  if (next.has(g.id)) next.delete(g.id); else next.add(g.id)
                  return next
                })}
                className="w-4 h-5 flex items-center justify-center text-[var(--text-dim)] hover:text-[var(--text)]"
                aria-label={isCollapsed ? t('scene.group.expand') : t('scene.group.collapse')}
                aria-expanded={!isCollapsed}
              >
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
                  className={`transition-transform ${isCollapsed ? '-rotate-90' : ''}`}>
                  <path d="M1 3l4 4 4-4"/>
                </svg>
              </button>
              <button onClick={() => toggleGroup(g)} title={vis ? t('scene.tree.hideGroup') : t('scene.tree.showGroup')}
                className={`${iconBtn} ${vis ? 'text-[var(--accent)]' : ''}`}>
                <EyeIcon on={vis} />
              </button>

              {renaming === g.id ? (
                <input
                  autoFocus
                  defaultValue={g.label}
                  aria-label={t('scene.tree.rename')}
                  onFocus={(e) => e.currentTarget.select()}
                  onBlur={(e) => { store.renameGroup(materialize(g), e.currentTarget.value); setRenaming(null) }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur()
                    if (e.key === 'Escape') setRenaming(null)
                  }}
                  className="flex-1 min-w-0 bg-[rgba(255,255,255,0.05)] border border-[var(--accent)] rounded px-1.5 py-0.5 text-[11px] text-[var(--text)] focus:outline-none"
                />
              ) : (
                <span
                  className="flex-1 min-w-0 flex flex-col cursor-text"
                  onDoubleClick={() => setRenaming(g.id)}
                  title={t('scene.tree.renameHint')}
                >
                  <span className="truncate text-[11px] font-medium text-[var(--text)]">{g.label}</span>
                  <span className="truncate text-[9.5px] text-[var(--text-muted)]">
                    {basisLabel(g.basis)}
                    {' · '}{t('scene.tree.counts', { models: members.length, clouds: gClouds.length })}
                  </span>
                </span>
              )}

              <button onClick={() => frame([...g.memberIds, ...g.cloudIds])} title={t('scene.tree.frameGroup')} className={iconBtn}>
                <FrameIcon />
              </button>
              <GroupMenu
                canMoveUp={g.user && userIdx > 0}
                canMoveDown={g.user && userIdx >= 0 && userIdx < userCount - 1}
                isUser={g.user}
                onRename={() => setRenaming(g.id)}
                onPin={() => { materialize(g) }}
                onUp={() => store.moveGroup(g.id, -1)}
                onDown={() => store.moveGroup(g.id, 1)}
                onDelete={() => store.deleteGroup(g.id)}
              />
            </div>

            {members.length > 1 && (
              <div className="px-2 pb-1.5 -mt-0.5">
                <button
                  onClick={() => onMoveTogether(g)}
                  className={[
                    'h-[20px] px-1.5 rounded-[5px] text-[10px] border transition-all',
                    moveTogetherActive(g)
                      ? 'bg-[var(--surface-2)] text-[var(--text)] border-[var(--border-strong)]'
                      : 'text-[var(--text-dim)] border-[var(--border)] hover:text-[var(--text)]',
                  ].join(' ')}
                  title={t('scene.group.moveTogetherHint')}
                >
                  {t('scene.group.moveTogether')}
                </button>
              </div>
            )}

            {!isCollapsed && (
              <div className="px-1 pb-1 space-y-1">
                {members.map((m) => (
                  <div key={m.id} {...dragProps({ kind: 'model', id: m.id })}>
                    {renderModelRow(m, modelMove(m))}
                  </div>
                ))}
                {gClouds.map(cloudRow)}
                {members.length + gClouds.length === 0 && (
                  <p className="text-[10.5px] text-[var(--text-muted)] text-center py-2 px-2 border border-dashed border-[var(--border)] rounded-md">
                    {t('scene.tree.emptyGroup')}
                  </p>
                )}
              </div>
            )}
          </div>
        )
      })}

      {looseClouds.length > 0 && (
        <div
          {...dropProps(LOOSE, dropOnto(LOOSE))}
          className={`rounded-[8px] border border-dashed transition-colors ${
            dropTarget === LOOSE ? 'border-[var(--accent)]' : 'border-[var(--border)]'
          }`}
        >
          <p className="px-2.5 pt-1.5 text-[9.5px] uppercase tracking-wider text-[var(--text-muted)]">{t('scene.tree.looseClouds')}</p>
          <div className="px-1 pb-1 space-y-1">{looseClouds.map(cloudRow)}</div>
        </div>
      )}

      <button
        onClick={() => setRenaming(store.createGroup(newGroupName()))}
        className="w-full h-7 rounded-md border border-dashed border-[var(--border)] text-[11px] text-[var(--text-dim)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors"
        {...dropProps(NEW, (item) => {
          const id = store.createGroup(newGroupName())
          setRenaming(id)
          if (item.kind === 'model') { const m = modelsById.get(item.id); if (m) store.assignModel(modelFileKey(m), id) }
          else { const c = cloudsById.get(item.id); if (c) store.assignCloud(c.fileKey, id) }
        })}
      >
        {dropTarget === NEW ? t('scene.tree.dropToCreate') : `+ ${t('scene.tree.newGroup')}`}
      </button>
    </div>
  )
}

// ── Group menu ───────────────────────────────────────────────────────────────

function GroupMenu({
  canMoveUp, canMoveDown, isUser, onRename, onPin, onUp, onDown, onDelete,
}: {
  canMoveUp: boolean; canMoveDown: boolean; isUser: boolean
  onRename: () => void; onPin: () => void; onUp: () => void; onDown: () => void; onDelete: () => void
}): React.ReactElement {
  const { t } = useTranslation('viewer')
  return (
    <label className={`${iconBtn} relative cursor-pointer`} title={t('scene.tree.groupMenu')}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><circle cx="2.5" cy="6" r="1"/><circle cx="6" cy="6" r="1"/><circle cx="9.5" cy="6" r="1"/></svg>
      <select
        aria-label={t('scene.tree.groupMenu')}
        value=""
        onChange={(e) => {
          const v = e.target.value
          if (v === 'rename') onRename()
          else if (v === 'pin') onPin()
          else if (v === 'up') onUp()
          else if (v === 'down') onDown()
          else if (v === 'delete') onDelete()
        }}
        className="absolute inset-0 opacity-0 cursor-pointer"
      >
        <option value="" disabled>{t('scene.tree.groupMenu')}</option>
        <option value="rename">{t('scene.tree.rename')}</option>
        {!isUser && <option value="pin">{t('scene.tree.pin')}</option>}
        {canMoveUp && <option value="up">{t('scene.tree.moveUp')}</option>}
        {canMoveDown && <option value="down">{t('scene.tree.moveDown')}</option>}
        {isUser && <option value="delete">{t('scene.tree.delete')}</option>}
      </select>
    </label>
  )
}
