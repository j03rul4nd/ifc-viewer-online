// ─── ScopeBar ─────────────────────────────────────────────────────────────────
// 'Applies to: All scans | Selected (N)' — one compact row in the sticky
// header, under the tabs, shown with two or more scans. It follows the list
// selection and can be flipped back to All. On Analyze it is locked: filters
// and use cases are always scene-wide.

import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import { usePointCloudStore, selectEffectiveScope, cloudLabel } from '../../stores/pointCloudStore'
import { Segmented } from './pc-ui'

export function ScopeBar({ locked }: { locked?: boolean }) {
  const { t } = useTranslation('pointcloud')
  const count = usePointCloudStore((s) => s.clouds.length)
  const scope = usePointCloudStore(selectEffectiveScope)
  const names = usePointCloudStore(useShallow((s) =>
    s.clouds.filter((c) => s.selectedCloudIds.includes(c.id)).map((c) => cloudLabel(c))))
  if (count < 2) return null
  if (locked) {
    return (
      <div data-testid="pc-scope-bar" className="px-4 py-1.5 text-[11px] text-[var(--text-faint)] border-b border-[var(--border)] truncate">
        {t('scope.analyzeCaption')}
      </div>
    )
  }
  const joined = names.join(', ')
  const shown = joined.length > 60 ? `${joined.slice(0, 59)}…` : joined
  return (
    <div data-testid="pc-scope-bar" className="px-3 py-1 border-b border-[var(--border)] flex items-center gap-2 min-w-0">
      <span className="text-[11px] text-[var(--text-faint)] shrink-0">{t('scope.label')}</span>
      <Segmented
        label={t('scope.label')}
        value={scope}
        options={[
          { value: 'all', label: t('scope.all'), testId: 'pc-scope-all' },
          {
            value: 'selection', label: t('scope.selected', { count: names.length }), testId: 'pc-scope-selected',
            disabled: names.length === 0, title: names.length === 0 ? t('scope.emptySelection') : undefined,
          },
        ]}
        onChange={(v) => usePointCloudStore.getState().setEditScope(v as 'all' | 'selection')}
      />
      <span className="flex-1 min-w-0 truncate text-[10.5px] text-[var(--text-faint)] select-text"
        title={scope === 'all' ? t('scope.allCaption', { count }) : t('scope.selectedCaption', { names: joined })}>
        {scope === 'all' ? t('scope.allCaption', { count }) : t('scope.selectedCaption', { names: shown })}
      </span>
    </div>
  )
}
