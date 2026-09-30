// Localized text for the pure report / BCF builders (they stay i18n-free).
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { ReportText } from '../../lib/compare/report'
import type { BcfSyncText } from '../../lib/compare/bcf-sync'
import { CHANGE_CATEGORIES } from '../../lib/compare/types'

export function useReportText(): ReportText {
  const { t, i18n } = useTranslation('compare')
  return useMemo(() => ({
    title: t('report.title'),
    subtitle: (base, head, date) => t('report.subtitle', { base, head, date }),
    added: t('status.added'), removed: t('status.removed'), modified: t('status.modified'), unchanged: t('status.unchanged'),
    churn: t('changes.churn'),
    files: t('changes.files'), byClass: t('report.byClass'), byStorey: t('report.byStorey'), changes: t('report.changes'), ids: t('tabs.ids'),
    file: t('report.file'), ifcClass: t('report.class'), storey: t('report.storey'), status: t('report.status'),
    element: t('report.element'), detail: t('report.detail'),
    pairing: Object.fromEntries((['project', 'guid-overlap', 'file-name', 'unmatched'] as const).map((k) => [k, t(`pairing.${k}`)])),
    idsScore: t('ids.score'), idsResolved: t('ids.resolved'), idsIntroduced: t('ids.introduced'),
    spec: t('ids.spec'), failedBefore: t('ids.failedBefore'), failedAfter: t('ids.failedAfter'),
    truncated: (shown, total) => t('report.truncated', { shown, total }),
    statusLabel: { added: t('status.added'), removed: t('status.removed'), modified: t('status.modified'), unchanged: t('status.unchanged') },
    category: Object.fromEntries(CHANGE_CATEGORIES.map((k) => [k, t(`category.${k}`)])),
  }), [t, i18n.language])
}

export function useBcfText(author: string): BcfSyncText {
  const { t, i18n } = useTranslation('compare')
  return useMemo(() => ({
    removed: (names, label) => t('bcf.text.removed', { names, label }),
    modified: (names, what, label) => t('bcf.text.modified', { names, what, label }),
    unchanged: (label) => t('bcf.text.unchanged', { label }),
    idsResolved: (spec, label) => t('bcf.text.idsResolved', { spec, label }),
    proposeClose: t('bcf.text.proposeClose'),
    changeGroupTitle: (status, count, ifcClass, storey) => t('bcf.text.groupTitle', { status: t(`status.${status}`), count, ifcClass, storey }),
    idsTopicTitle: (spec, count) => t('bcf.text.idsTitle', { spec, count }),
    author,
  }), [t, i18n.language, author])
}
