import { useState } from 'react'
import type { SectionProps } from '../registry'
import { ISO_SUITABILITY, type Iso19650State } from '../../../lib/plans/types'
import { Head, SettingGroup, SettingRow, Toggle, inputClass, DataList } from '../ui'
import { SoonBanner } from '../Soon'
import { SAMPLE_AUDIT } from '../plan-sample-data'
import { useTx } from '../i18n'

const STATES: { id: Iso19650State; label: string }[] = [
  { id: 'wip', label: 'Work in progress' }, { id: 'shared', label: 'Shared' },
  { id: 'published', label: 'Published' }, { id: 'archived', label: 'Archived' },
]

/** T1 quality gate · T2 house standard · T5 ISO 19650 states · T8 audit log. */
export default function Quality(_: SectionProps) {
  const tx = useTx()
  const [minScore, setMinScore] = useState(80)
  const [review, setReview] = useState(true)
  const [autoIssues, setAutoIssues] = useState(true)
  return (
    <>
      <Head title={tx('Quality gate')} sub={tx('Every upload is validated with your house standard. Nothing is published below the minimum score without a reviewer.')} />
      <SoonBanner section="quality" />

      <SettingGroup title={tx('Publishing rules')}>
        <SettingRow title={tx('Minimum Health Score to publish')} detail={tx('Uploads below it stay in Shared until they improve.')}>
          <input type="number" min={0} max={100} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} className={`${inputClass} w-[80px] tabular-nums`} aria-label={tx('Minimum Health Score to publish')} />
        </SettingRow>
        <SettingRow title={tx('A reviewer must approve')} detail={tx('Reviewers are free seats.')}>
          <Toggle checked={review} onChange={setReview} label={tx('A reviewer must approve')} />
        </SettingRow>
        <SettingRow title={tx('Open an issue for each failed rule')} detail={tx('Assigned to whoever uploaded the file.')}>
          <Toggle checked={autoIssues} onChange={setAutoIssues} label={tx('Open an issue for each failed rule')} />
        </SettingRow>
      </SettingGroup>

      <SettingGroup title={tx('House standard')}>
        <SettingRow title={tx('Validation profile')} detail="EIR Estudio Norte 2026 · IDS CatSalut 2026" />
        <SettingRow title={tx('File naming')} detail="ISO 19650-2 · PRJ-ORG-VOL-LV-TYP-ROLE-NUM" />
        <SettingRow title={tx('Classification')} detail="Uniclass 2015" />
      </SettingGroup>

      <SettingGroup title={tx('ISO 19650 states')}>
        {STATES.map((s) => (
          <SettingRow key={s.id} title={tx(s.label)} detail={ISO_SUITABILITY[s.id].join(' · ')} />
        ))}
      </SettingGroup>

      <h2 className="text-[13px] font-semibold mb-2">{tx('Audit log')}</h2>
      <DataList rows={SAMPLE_AUDIT} rowKey={(a) => a.at + a.what} primaryHeader={tx('Event')}
        primary={(a) => <p>{a.what}</p>}
        columns={[
          { key: 'who', header: tx('Who'), cell: (a) => <span className="text-[12.5px]">{a.who === 'System' ? tx('System') : a.who}</span> },
          { key: 'at', header: tx('When'), cell: (a) => <span className="text-[12px] tabular-nums text-[var(--text-dim)]">{a.at}</span> },
        ]} />
    </>
  )
}
